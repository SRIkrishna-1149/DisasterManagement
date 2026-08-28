
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('community','rescue','admin');
CREATE TYPE public.sos_status AS ENUM ('UNVERIFIED','VALIDATED','REJECTED','NEEDS_MORE_INFORMATION','ASSIGNED','DISPATCHED','EN_ROUTE','ARRIVED','RESCUE_IN_PROGRESS','RESOLVED','CANCELLED','DUPLICATE');
CREATE TYPE public.severity_level AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE public.location_source AS ENUM ('GPS','MANUAL_PIN','LANDMARK');
CREATE TYPE public.alert_level AS ENUM ('INFO','WATCH','WARNING','CRITICAL');
CREATE TYPE public.resource_status AS ENUM ('ACTIVE','INACTIVE','FULL','UNKNOWN','TEMPORARILY_UNAVAILABLE');
CREATE TYPE public.team_status AS ENUM ('AVAILABLE','DEPLOYED','OFFLINE');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_operator(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('rescue','admin'))
$$;

CREATE POLICY "profiles readable by self or operators" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_operator(auth.uid()));
CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "roles readable by self or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- new user bootstrap
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'community') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- DISASTER INCIDENTS
CREATE TABLE public.disaster_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  disaster_type text NOT NULL,
  area_name text,
  latitude double precision,
  longitude double precision,
  radius_km double precision DEFAULT 5,
  severity public.severity_level NOT NULL DEFAULT 'MEDIUM',
  active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.disaster_events TO anon, authenticated;
GRANT INSERT, UPDATE ON public.disaster_events TO authenticated;
GRANT ALL ON public.disaster_events TO service_role;
ALTER TABLE public.disaster_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events public read" ON public.disaster_events FOR SELECT USING (true);
CREATE POLICY "events managed by operators" ON public.disaster_events FOR ALL TO authenticated
  USING (public.is_operator(auth.uid())) WITH CHECK (public.is_operator(auth.uid()));

-- RESCUE TEAMS
CREATE TABLE public.rescue_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status public.team_status NOT NULL DEFAULT 'AVAILABLE',
  capacity int NOT NULL DEFAULT 4,
  equipment text[] NOT NULL DEFAULT '{}',
  contact_phone text,
  latitude double precision,
  longitude double precision,
  location_updated_at timestamptz,
  current_mission_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rescue_teams TO authenticated;
GRANT ALL ON public.rescue_teams TO service_role;
ALTER TABLE public.rescue_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams readable by operators" ON public.rescue_teams FOR SELECT TO authenticated USING (public.is_operator(auth.uid()));
CREATE POLICY "teams managed by operators" ON public.rescue_teams FOR ALL TO authenticated
  USING (public.is_operator(auth.uid())) WITH CHECK (public.is_operator(auth.uid()));

-- SOS REQUESTS
CREATE TABLE public.sos_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference bigint GENERATED BY DEFAULT AS IDENTITY,
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
  reporter_name text,
  people_count int NOT NULL DEFAULT 1 CHECK (people_count > 0 AND people_count < 1000),
  category text NOT NULL,
  severity public.severity_level NOT NULL DEFAULT 'HIGH',
  description text,
  medical_needs text,
  has_medical_emergency boolean NOT NULL DEFAULT false,
  has_vulnerable_people boolean NOT NULL DEFAULT false,
  latitude double precision,
  longitude double precision,
  location_source public.location_source NOT NULL DEFAULT 'GPS',
  location_accuracy_m double precision,
  landmark text,
  status public.sos_status NOT NULL DEFAULT 'UNVERIFIED',
  priority_score int NOT NULL DEFAULT 0,
  priority_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  incident_id uuid REFERENCES public.disaster_events(id) ON DELETE SET NULL,
  merged_into_id uuid REFERENCES public.sos_requests(id) ON DELETE SET NULL,
  assigned_team_id uuid REFERENCES public.rescue_teams(id) ON DELETE SET NULL,
  validated_by uuid,
  validated_at timestamptz,
  validation_notes text,
  dismissed_reason text,
  client_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sos_status_idx ON public.sos_requests(status);
CREATE INDEX sos_user_idx ON public.sos_requests(user_id);
CREATE INDEX sos_created_idx ON public.sos_requests(created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.sos_requests TO authenticated;
GRANT ALL ON public.sos_requests TO service_role;
ALTER TABLE public.sos_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sos read own or operator" ON public.sos_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_operator(auth.uid()));
CREATE POLICY "sos insert own" ON public.sos_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "sos update own limited" ON public.sos_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "sos update by operator" ON public.sos_requests FOR UPDATE TO authenticated
  USING (public.is_operator(auth.uid())) WITH CHECK (public.is_operator(auth.uid()));

-- SOS EVENT HISTORY (append-only)
CREATE TABLE public.sos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_id uuid NOT NULL REFERENCES public.sos_requests(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  previous_status public.sos_status,
  new_status public.sos_status,
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sos_events_sos_idx ON public.sos_events(sos_id, created_at DESC);
GRANT SELECT, INSERT ON public.sos_events TO authenticated;
GRANT ALL ON public.sos_events TO service_role;
ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sos events readable" ON public.sos_events FOR SELECT TO authenticated
  USING (public.is_operator(auth.uid()) OR EXISTS (SELECT 1 FROM public.sos_requests s WHERE s.id = sos_id AND s.user_id = auth.uid()));
CREATE POLICY "sos events insert" ON public.sos_events FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- ALERTS
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  level public.alert_level NOT NULL DEFAULT 'INFO',
  disaster_type text,
  area_name text,
  latitude double precision,
  longitude double precision,
  radius_km double precision DEFAULT 10,
  recommended_action text,
  reason text,
  risk_score int,
  incident_id uuid REFERENCES public.disaster_events(id) ON DELETE SET NULL,
  approval_required boolean NOT NULL DEFAULT false,
  approval_status text NOT NULL DEFAULT 'APPROVED',
  approved_by uuid,
  approved_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'CREATED',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.alerts TO anon, authenticated;
GRANT INSERT, UPDATE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approved alerts public" ON public.alerts FOR SELECT
  USING (approval_status = 'APPROVED' AND cancelled_at IS NULL);
CREATE POLICY "alerts full access operators" ON public.alerts FOR ALL TO authenticated
  USING (public.is_operator(auth.uid())) WITH CHECK (public.is_operator(auth.uid()));

CREATE TABLE public.alert_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_id, user_id)
);
GRANT SELECT, INSERT ON public.alert_acknowledgements TO authenticated;
GRANT ALL ON public.alert_acknowledgements TO service_role;
ALTER TABLE public.alert_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ack read operators or self" ON public.alert_acknowledgements FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_operator(auth.uid()));
CREATE POLICY "ack insert self" ON public.alert_acknowledgements FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- EMERGENCY RESOURCES
CREATE TABLE public.emergency_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  resource_type text NOT NULL,
  address text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  capacity int,
  occupancy int,
  contact_phone text,
  status public.resource_status NOT NULL DEFAULT 'UNKNOWN',
  last_verified_at timestamptz,
  verification_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.emergency_resources TO anon, authenticated;
GRANT INSERT, UPDATE ON public.emergency_resources TO authenticated;
GRANT ALL ON public.emergency_resources TO service_role;
ALTER TABLE public.emergency_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resources public read" ON public.emergency_resources FOR SELECT USING (true);
CREATE POLICY "resources managed by operators" ON public.emergency_resources FOR ALL TO authenticated
  USING (public.is_operator(auth.uid())) WITH CHECK (public.is_operator(auth.uid()));

-- COMMUNITY REPORTS
CREATE TABLE public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  report_type text NOT NULL,
  description text,
  latitude double precision,
  longitude double precision,
  severity public.severity_level NOT NULL DEFAULT 'MEDIUM',
  verification_status text NOT NULL DEFAULT 'UNVERIFIED',
  incident_id uuid REFERENCES public.disaster_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports read verified or own" ON public.community_reports FOR SELECT TO authenticated
  USING (verification_status = 'VERIFIED' OR user_id = auth.uid() OR public.is_operator(auth.uid()));
CREATE POLICY "reports insert own" ON public.community_reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "reports update operators" ON public.community_reports FOR UPDATE TO authenticated
  USING (public.is_operator(auth.uid())) WITH CHECK (public.is_operator(auth.uid()));

-- RISK ASSESSMENTS
CREATE TABLE public.risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  disaster_type text NOT NULL DEFAULT 'flood',
  risk_score int NOT NULL,
  risk_level text NOT NULL,
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  engine text NOT NULL DEFAULT 'rule-based-v1',
  confidence text,
  data_quality text NOT NULL DEFAULT 'SIMULATED',
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.risk_assessments TO anon, authenticated;
GRANT INSERT ON public.risk_assessments TO authenticated;
GRANT ALL ON public.risk_assessments TO service_role;
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk public read" ON public.risk_assessments FOR SELECT USING (true);
CREATE POLICY "risk write operators" ON public.risk_assessments FOR INSERT TO authenticated WITH CHECK (public.is_operator(auth.uid()));

-- DATA SOURCES
CREATE TABLE public.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'UNAVAILABLE',
  mode text NOT NULL DEFAULT 'SIMULATED',
  last_successful_update timestamptz,
  last_error text,
  retry_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.data_sources TO anon, authenticated;
GRANT UPDATE ON public.data_sources TO authenticated;
GRANT ALL ON public.data_sources TO service_role;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources public read" ON public.data_sources FOR SELECT USING (true);
CREATE POLICY "sources admin write" ON public.data_sources FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- AUDIT LOGS (append only)
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON public.audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read operators" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_operator(auth.uid()));
CREATE POLICY "audit insert authenticated" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER t_sos_updated BEFORE UPDATE ON public.sos_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_teams_updated BEFORE UPDATE ON public.rescue_teams FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_res_updated BEFORE UPDATE ON public.emergency_resources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- state machine enforcement + team locking
CREATE OR REPLACE FUNCTION public.enforce_sos_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE allowed boolean := false;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  allowed := CASE OLD.status
    WHEN 'UNVERIFIED' THEN NEW.status IN ('VALIDATED','REJECTED','NEEDS_MORE_INFORMATION','DUPLICATE','CANCELLED')
    WHEN 'NEEDS_MORE_INFORMATION' THEN NEW.status IN ('UNVERIFIED','VALIDATED','REJECTED','CANCELLED','DUPLICATE')
    WHEN 'VALIDATED' THEN NEW.status IN ('ASSIGNED','REJECTED','DUPLICATE','CANCELLED')
    WHEN 'ASSIGNED' THEN NEW.status IN ('DISPATCHED','VALIDATED','CANCELLED')
    WHEN 'DISPATCHED' THEN NEW.status IN ('EN_ROUTE','CANCELLED')
    WHEN 'EN_ROUTE' THEN NEW.status IN ('ARRIVED','CANCELLED')
    WHEN 'ARRIVED' THEN NEW.status IN ('RESCUE_IN_PROGRESS','CANCELLED')
    WHEN 'RESCUE_IN_PROGRESS' THEN NEW.status IN ('RESOLVED','CANCELLED')
    ELSE false
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid SOS state transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER t_sos_transition BEFORE UPDATE OF status ON public.sos_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sos_transition();

CREATE OR REPLACE FUNCTION public.assign_team_to_sos(_sos_id uuid, _team_id uuid, _override boolean DEFAULT false)
RETURNS public.sos_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.rescue_teams; s public.sos_requests;
BEGIN
  IF NOT public.is_operator(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO t FROM public.rescue_teams WHERE id = _team_id FOR UPDATE;
  IF t IS NULL THEN RAISE EXCEPTION 'Team not found'; END IF;
  IF t.status <> 'AVAILABLE' AND NOT _override THEN RAISE EXCEPTION 'Team is not available'; END IF;
  SELECT * INTO s FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF s IS NULL THEN RAISE EXCEPTION 'SOS not found'; END IF;
  IF s.status <> 'VALIDATED' THEN RAISE EXCEPTION 'Only validated requests can be assigned'; END IF;
  UPDATE public.rescue_teams SET status = 'DEPLOYED', current_mission_id = _sos_id WHERE id = _team_id;
  UPDATE public.sos_requests SET status = 'ASSIGNED', assigned_team_id = _team_id WHERE id = _sos_id RETURNING * INTO s;
  INSERT INTO public.sos_events (sos_id, actor_id, event_type, previous_status, new_status, reason)
  VALUES (_sos_id, auth.uid(), 'ASSIGNMENT', 'VALIDATED', 'ASSIGNED', CASE WHEN _override THEN 'override' ELSE NULL END);
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_state, reason)
  VALUES (auth.uid(), 'ASSIGN_TEAM', 'sos_request', _sos_id::text, jsonb_build_object('team_id', _team_id), CASE WHEN _override THEN 'override' ELSE NULL END);
  RETURN s;
END; $$;

CREATE OR REPLACE FUNCTION public.release_team_on_close() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('RESOLVED','CANCELLED','REJECTED','DUPLICATE') AND NEW.assigned_team_id IS NOT NULL THEN
    UPDATE public.rescue_teams SET status='AVAILABLE', current_mission_id=NULL WHERE id = NEW.assigned_team_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER t_release_team AFTER UPDATE OF status ON public.sos_requests
  FOR EACH ROW EXECUTE FUNCTION public.release_team_on_close();

-- realtime
ALTER TABLE public.sos_requests REPLICA IDENTITY FULL;
ALTER TABLE public.alerts REPLICA IDENTITY FULL;
ALTER TABLE public.rescue_teams REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rescue_teams;

-- SEED reference data (demo, explicitly labelled in-app)
INSERT INTO public.data_sources (name, category, status, mode) VALUES
 ('Weather API','weather','UNAVAILABLE','SIMULATED'),
 ('Satellite Feed','satellite','UNAVAILABLE','SIMULATED'),
 ('IoT Sensor Network','iot','UNAVAILABLE','SIMULATED'),
 ('Ground Water-Level Sensors','sensor','UNAVAILABLE','SIMULATED'),
 ('Map Service','map','CONNECTED','LIVE'),
 ('Database','core','CONNECTED','LIVE'),
 ('Realtime','core','CONNECTED','LIVE'),
 ('Risk Engine','engine','CONNECTED','LIVE'),
 ('Notifications','notify','DEGRADED','SIMULATED');

INSERT INTO public.emergency_resources (name, resource_type, address, latitude, longitude, capacity, occupancy, contact_phone, status, last_verified_at, verification_source) VALUES
 ('Central Community Shelter','shelter','MG Road, Sector 4', 12.9716, 77.5946, 400, 120, '+91-80-1000-0001','ACTIVE', now() - interval '2 hours','Municipal Office'),
 ('Riverside High School Shelter','shelter','Riverside Road', 12.9810, 77.6100, 250, 250, '+91-80-1000-0002','FULL', now() - interval '5 hours','Ward Officer'),
 ('North Zone Relief Camp','shelter','North Ring Road', 12.9950, 77.5800, 300, 40, '+91-80-1000-0003','ACTIVE', now() - interval '30 hours','Community Report'),
 ('City General Hospital','hospital','Hospital Road', 12.9650, 77.5900, 180, 150, '+91-80-2000-0001','ACTIVE', now() - interval '1 hour','Hospital Admin'),
 ('Eastside Medical Centre','hospital','East Avenue', 12.9700, 77.6250, 90, 88, '+91-80-2000-0002','TEMPORARILY_UNAVAILABLE', now() - interval '9 hours','Hospital Admin'),
 ('Municipal Rescue Station 1','rescue_center','Fire Station Lane', 12.9600, 77.6000, NULL, NULL, '+91-80-3000-0001','ACTIVE', now() - interval '3 hours','Command Center'),
 ('Hilltop Safe Zone','safe_zone','Hilltop Park', 13.0050, 77.6050, NULL, NULL, NULL,'ACTIVE', now() - interval '12 hours','Command Center');

INSERT INTO public.rescue_teams (name, status, capacity, equipment, contact_phone, latitude, longitude, location_updated_at) VALUES
 ('Alpha Water Rescue','AVAILABLE',6,'{boat,rope,life-jackets}','+91-90000-00001',12.9700,77.5950, now() - interval '40 seconds'),
 ('Bravo Medical Response','AVAILABLE',4,'{ambulance,medical-kit}','+91-90000-00002',12.9750,77.6020, now() - interval '3 minutes'),
 ('Charlie Heavy Rescue','OFFLINE',8,'{truck,cutter,generator}','+91-90000-00003',12.9550,77.5850, now() - interval '2 hours');

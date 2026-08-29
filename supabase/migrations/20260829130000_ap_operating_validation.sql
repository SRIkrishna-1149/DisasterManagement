-- Andhra Pradesh operating-area safeguards.
-- These are intentionally broad operating bounds for this AP-focused product,
-- not a fabricated legal or administrative boundary polygon.
CREATE OR REPLACE FUNCTION public.is_inside_andhra_pradesh(_latitude double precision, _longitude double precision)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _latitude BETWEEN 12.62 AND 19.92
    AND _longitude BETWEEN 76.75 AND 84.80
$$;

CREATE OR REPLACE FUNCTION public.validate_ap_operating_coordinates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS NULL AND NEW.longitude IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.latitude IS NULL OR NEW.longitude IS NULL
     OR NOT public.is_inside_andhra_pradesh(NEW.latitude, NEW.longitude) THEN
    RAISE EXCEPTION 'Coordinates must be inside the Andhra Pradesh operating area';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_sos_ap_coordinates ON public.sos_requests;
CREATE TRIGGER validate_sos_ap_coordinates
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.sos_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_ap_operating_coordinates();

DROP TRIGGER IF EXISTS validate_report_ap_coordinates ON public.community_reports;
CREATE TRIGGER validate_report_ap_coordinates
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION public.validate_ap_operating_coordinates();

DROP TRIGGER IF EXISTS validate_event_ap_coordinates ON public.disaster_events;
CREATE TRIGGER validate_event_ap_coordinates
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.disaster_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_ap_operating_coordinates();

DROP TRIGGER IF EXISTS validate_risk_ap_coordinates ON public.risk_assessments;
CREATE TRIGGER validate_risk_ap_coordinates
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.validate_ap_operating_coordinates();

DROP TRIGGER IF EXISTS validate_alert_ap_coordinates ON public.alerts;
CREATE TRIGGER validate_alert_ap_coordinates
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.validate_ap_operating_coordinates();

DROP TRIGGER IF EXISTS validate_resource_ap_coordinates ON public.emergency_resources;
CREATE TRIGGER validate_resource_ap_coordinates
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.emergency_resources
  FOR EACH ROW EXECUTE FUNCTION public.validate_ap_operating_coordinates();

DROP TRIGGER IF EXISTS validate_team_ap_coordinates ON public.rescue_teams;
CREATE TRIGGER validate_team_ap_coordinates
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.rescue_teams
  FOR EACH ROW EXECUTE FUNCTION public.validate_ap_operating_coordinates();

-- Bounded abuse protection. This limits bursts without permanently blocking a
-- user or replacing the duplicate-review flow in the client.
CREATE OR REPLACE FUNCTION public.limit_sos_submission_burst()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE recent_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sos_requests
    WHERE idempotency_key = NEW.idempotency_key
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.sos_requests
  WHERE user_id = NEW.user_id
    AND NEW.user_id IS NOT NULL
    AND created_at > now() - interval '10 minutes';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Too many SOS submissions in a short period. Review the active request or try again shortly.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS limit_sos_submission_burst ON public.sos_requests;
CREATE TRIGGER limit_sos_submission_burst
  BEFORE INSERT ON public.sos_requests
  FOR EACH ROW EXECUTE FUNCTION public.limit_sos_submission_burst();

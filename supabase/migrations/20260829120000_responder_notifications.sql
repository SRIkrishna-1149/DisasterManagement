-- Responder roster and server-side delivery ledger.
-- Passwords and auth tokens are intentionally never stored here.
CREATE TABLE public.responder_contacts (
  email text PRIMARY KEY CHECK (position('@' in email) > 1),
  display_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.responder_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.responder_contacts FROM anon, authenticated;
GRANT ALL ON public.responder_contacts TO service_role;

CREATE TABLE public.sos_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_id uuid NOT NULL REFERENCES public.sos_requests(id) ON DELETE CASCADE,
  operation_id text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENDING','DELIVERED','FAILED')),
  provider_message_id text,
  last_error text,
  attempts int NOT NULL DEFAULT 0,
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sos_id, recipient_email)
);
CREATE INDEX sos_notifications_sos_idx ON public.sos_notifications(sos_id);
ALTER TABLE public.sos_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sos_notifications FROM anon, authenticated;
GRANT ALL ON public.sos_notifications TO service_role;

-- Automatically recognize the supplied responder accounts when they sign in.
-- This does not create accounts or bypass authentication; it only grants the
-- rescue role after Supabase has authenticated the matching email address.
CREATE OR REPLACE FUNCTION public.is_responder_email(_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(coalesce(_email, '')) IN (
    'vanvarchaghee123@gmail.com',
    'saisanthosh353@gmail.com',
    'srungarapusantoshi@gmail.com',
    'avlprasanna23@gmail.com',
    'naniaddala353@gmail.com',
    'srungarputulasiprasanna8317@gmail.com'
  )
$$;
REVOKE ALL ON FUNCTION public.is_responder_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_responder_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  IF public.is_responder_email(NEW.email) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'rescue') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'community') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

INSERT INTO public.responder_contacts (email, display_name) VALUES
  ('vanvarchaghee123@gmail.com', 'Responder 01'),
  ('saisanthosh353@gmail.com', 'Responder 02'),
  ('srungarapusantoshi@gmail.com', 'Responder 03'),
  ('avlprasanna23@gmail.com', 'Responder 04'),
  ('naniaddala353@gmail.com', 'Responder 05'),
  ('srungarputulasiprasanna8317@gmail.com', 'Responder 06')
ON CONFLICT (email) DO UPDATE SET active = true;

-- Backfill rescue access for accounts that already existed before this change.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'rescue'::public.app_role
FROM auth.users
WHERE public.is_responder_email(email)
ON CONFLICT (user_id, role) DO NOTHING;

CREATE TYPE public.booking_status AS ENUM (
    'pending',
    'approved',
    'partially_approved',
    'rejected',
    'cancelled',
    'emergency_cancelled',
    'completed'
);

CREATE TYPE public.hall_status AS ENUM (
    'available',
    'maintenance',
    'disabled'
);

CREATE TYPE public.maintenance_category AS ENUM (
    'electrical',
    'plumbing',
    'hvac',
    'furniture',
    'technology',
    'cleaning',
    'structural',
    'other'
);

CREATE TYPE public.maintenance_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);

CREATE TYPE public.maintenance_status AS ENUM (
    'pending',
    'in_progress',
    'resolved'
);

CREATE TYPE public.notification_type AS ENUM (
    'booking_approved',
    'booking_rejected',
    'booking_cancelled',
    'booking_pending',
    'system',
    'general'
);

CREATE TYPE public.role AS ENUM (
    'admin',
    'relations_manager',
    'requesting_department'
);

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    username text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id integer,
    details text,
    ip_address text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;

CREATE TABLE public.bookings (
    id integer NOT NULL,
    hall_id integer NOT NULL,
    user_id integer NOT NULL,
    status public.booking_status DEFAULT 'pending'::public.booking_status NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    start_time text NOT NULL,
    end_time text NOT NULL,
    activity_type text NOT NULL,
    reason text NOT NULL,
    notes text,
    needs_catering boolean DEFAULT false NOT NULL,
    needs_meals boolean DEFAULT false NOT NULL,
    catering_approved boolean,
    meals_approved boolean,
    coordinator_name text,
    coordinator_phone text,
    is_recurring boolean DEFAULT false NOT NULL,
    recurring_weeks integer,
    rejection_reason text,
    cancellation_reason text,
    approved_by integer,
    approver_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    manual_department_name text
);

CREATE SEQUENCE public.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.bookings_id_seq OWNED BY public.bookings.id;

CREATE TABLE public.halls (
    id integer NOT NULL,
    name text NOT NULL,
    name_ar text,
    location text NOT NULL,
    location_ar text,
    capacity integer NOT NULL,
    floor text,
    building text,
    reference_code text NOT NULL,
    status public.hall_status DEFAULT 'available'::public.hall_status NOT NULL,
    equipment text[] DEFAULT '{}'::text[] NOT NULL,
    images text[] DEFAULT '{}'::text[] NOT NULL,
    latitude real,
    longitude real,
    qr_code text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    provides_hospitality boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE public.halls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.halls_id_seq OWNED BY public.halls.id;

CREATE TABLE public.holidays (
    id integer NOT NULL,
    date text NOT NULL,
    name text NOT NULL,
    name_ar text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.holidays_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.holidays_id_seq OWNED BY public.holidays.id;

CREATE TABLE public.maintenance_notes (
    id integer NOT NULL,
    hall_id integer NOT NULL,
    category public.maintenance_category NOT NULL,
    priority public.maintenance_priority NOT NULL,
    status public.maintenance_status DEFAULT 'pending'::public.maintenance_status NOT NULL,
    description text NOT NULL,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    scheduled_date timestamp without time zone,
    last_reminder_sent_at timestamp without time zone
);

CREATE SEQUENCE public.maintenance_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.maintenance_notes_id_seq OWNED BY public.maintenance_notes.id;

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title text NOT NULL,
    title_ar text,
    message text NOT NULL,
    message_ar text,
    type public.notification_type DEFAULT 'general'::public.notification_type NOT NULL,
    related_booking_id integer,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;

CREATE TABLE public.password_reset_requests (
    id integer NOT NULL,
    user_id integer NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    new_password text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    resolved_at timestamp without time zone
);

CREATE SEQUENCE public.password_reset_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.password_reset_requests_id_seq OWNED BY public.password_reset_requests.id;

CREATE TABLE public.platform_settings (
    id integer NOT NULL,
    company_name text DEFAULT 'Hall Booking Platform'::text NOT NULL,
    company_name_ar text DEFAULT 'منصة حجز القاعات'::text,
    logo_url text,
    footer_text text,
    footer_text_ar text,
    primary_color text DEFAULT '#1e40af'::text,
    default_language text DEFAULT 'ar'::text NOT NULL,
    working_hours_start text DEFAULT '07:00'::text NOT NULL,
    working_hours_end text DEFAULT '15:00'::text NOT NULL,
    password_min_length integer DEFAULT 8 NOT NULL,
    password_require_special boolean DEFAULT false NOT NULL,
    password_expiry_days integer,
    overdue_request_hours integer DEFAULT 24 NOT NULL,
    two_factor_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.platform_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.platform_settings_id_seq OWNED BY public.platform_settings.id;

CREATE TABLE public.reviews (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    user_id integer NOT NULL,
    hall_id integer NOT NULL,
    cleanliness_rating integer,
    equipment_rating integer,
    catering_rating integer,
    overall_rating real,
    comment text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;

CREATE TABLE public.sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    ip_address text,
    last_activity timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL
);

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    role public.role NOT NULL,
    department_name text,
    phone_number text,
    is_active boolean DEFAULT true NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    last_login timestamp without time zone,
    last_login_ip text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

CREATE TABLE public.waitlist (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.waitlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.waitlist_id_seq OWNED BY public.waitlist.id;

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);

ALTER TABLE ONLY public.bookings ALTER COLUMN id SET DEFAULT nextval('public.bookings_id_seq'::regclass);

ALTER TABLE ONLY public.halls ALTER COLUMN id SET DEFAULT nextval('public.halls_id_seq'::regclass);

ALTER TABLE ONLY public.holidays ALTER COLUMN id SET DEFAULT nextval('public.holidays_id_seq'::regclass);

ALTER TABLE ONLY public.maintenance_notes ALTER COLUMN id SET DEFAULT nextval('public.maintenance_notes_id_seq'::regclass);

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);

ALTER TABLE ONLY public.password_reset_requests ALTER COLUMN id SET DEFAULT nextval('public.password_reset_requests_id_seq'::regclass);

ALTER TABLE ONLY public.platform_settings ALTER COLUMN id SET DEFAULT nextval('public.platform_settings_id_seq'::regclass);

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

ALTER TABLE ONLY public.waitlist ALTER COLUMN id SET DEFAULT nextval('public.waitlist_id_seq'::regclass);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.halls
    ADD CONSTRAINT halls_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.halls
    ADD CONSTRAINT halls_reference_code_unique UNIQUE (reference_code);

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.maintenance_notes
    ADD CONSTRAINT maintenance_notes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_booking_id_unique UNIQUE (booking_id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_unique UNIQUE (token);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_hall_id_halls_id_fk FOREIGN KEY (hall_id) REFERENCES public.halls(id);

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.maintenance_notes
    ADD CONSTRAINT maintenance_notes_hall_id_halls_id_fk FOREIGN KEY (hall_id) REFERENCES public.halls(id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_hall_id_halls_id_fk FOREIGN KEY (hall_id) REFERENCES public.halls(id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);

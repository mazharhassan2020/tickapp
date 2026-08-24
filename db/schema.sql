--
-- PostgreSQL database dump
--

\restrict fdymBbH5dvjls3pN70Ud5I7IauB8SPjNYKPdaHQI1SrM7ryTAdaVA9XdblAV4AB

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ticket_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
);


--
-- Name: user_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_type AS ENUM (
    'user',
    'team',
    'admin',
    'superadmin'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying,
    provider text DEFAULT 'openai'::text NOT NULL,
    api_key text NOT NULL,
    model text DEFAULT 'gpt-4o-mini'::text NOT NULL,
    endpoint text DEFAULT 'https://api.openai.com/v1'::text,
    temperature text DEFAULT '0.7'::text,
    max_tokens text DEFAULT '2048'::text,
    is_active boolean DEFAULT false,
    words text[] DEFAULT ARRAY[]::text[],
    site_id character varying,
    last_skip_reason text,
    last_skip_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying,
    date timestamp with time zone NOT NULL,
    messages_sent integer DEFAULT 0,
    messages_delivered integer DEFAULT 0,
    messages_read integer DEFAULT 0,
    messages_replied integer DEFAULT 0,
    new_contacts integer DEFAULT 0,
    active_campaigns integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying,
    request_type character varying(50) NOT NULL,
    endpoint text NOT NULL,
    method character varying(10) NOT NULL,
    request_body jsonb,
    response_status integer,
    response_body jsonb,
    duration integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: app_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_features (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    number_masking boolean DEFAULT false NOT NULL,
    google_sheets boolean DEFAULT false NOT NULL,
    ordering_bot boolean DEFAULT false NOT NULL,
    custom_attributes boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    google_sheets_url text
);


--
-- Name: automation_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_edges (
    id character varying NOT NULL,
    automation_id character varying NOT NULL,
    source_node_id character varying NOT NULL,
    target_node_id character varying NOT NULL,
    source_handle character varying,
    animated boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: automation_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_execution_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    execution_id character varying NOT NULL,
    node_id character varying NOT NULL,
    node_type text NOT NULL,
    status text NOT NULL,
    input jsonb DEFAULT '{}'::jsonb,
    output jsonb DEFAULT '{}'::jsonb,
    error text,
    executed_at timestamp with time zone DEFAULT now()
);


--
-- Name: automation_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_executions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    automation_id character varying NOT NULL,
    contact_id character varying,
    conversation_id character varying,
    trigger_data jsonb DEFAULT '{}'::jsonb,
    trigger_message_id character varying(200),
    status text NOT NULL,
    current_node_id character varying,
    execution_path jsonb DEFAULT '[]'::jsonb,
    variables jsonb DEFAULT '{}'::jsonb,
    result text,
    error text,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
-- Name: automation_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_nodes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    automation_id character varying NOT NULL,
    node_id character varying NOT NULL,
    type text NOT NULL,
    subtype text,
    "position" jsonb DEFAULT '{}'::jsonb,
    measured jsonb DEFAULT '{}'::jsonb,
    data jsonb DEFAULT '{}'::jsonb,
    connections jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying,
    name text NOT NULL,
    description text,
    trigger text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'inactive'::text,
    execution_count integer DEFAULT 0,
    last_executed_at timestamp with time zone,
    created_by character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: billing_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    currency character varying DEFAULT 'USD'::character varying NOT NULL,
    default_rate numeric(10,4) DEFAULT '0'::numeric NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    markup numeric(10,4) DEFAULT 0 NOT NULL,
    wallet_billing_enabled boolean DEFAULT true NOT NULL
);


--
-- Name: campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_recipients (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    campaign_id character varying NOT NULL,
    contact_id character varying,
    phone text NOT NULL,
    name text,
    status text DEFAULT 'pending'::text,
    whatsapp_message_id character varying,
    template_params jsonb DEFAULT '{}'::jsonb,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    error_code character varying,
    error_message text,
    retry_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying,
    created_by character varying NOT NULL,
    name text NOT NULL,
    description text,
    campaign_type text NOT NULL,
    type text NOT NULL,
    api_type text NOT NULL,
    template_id character varying,
    template_name text,
    template_language text,
    variable_mapping jsonb DEFAULT '{}'::jsonb,
    contact_groups jsonb DEFAULT '[]'::jsonb,
    csv_data jsonb DEFAULT '[]'::jsonb,
    api_key character varying,
    api_endpoint text,
    status text DEFAULT 'draft'::text,
    scheduled_at timestamp with time zone,
    recipient_count integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    delivered_count integer DEFAULT 0,
    read_count integer DEFAULT 0,
    replied_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    completed_at timestamp with time zone,
    population_started_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: channel_signup_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_signup_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    status character varying(20) DEFAULT 'incomplete'::character varying NOT NULL,
    step character varying(50) DEFAULT 'token_exchange'::character varying NOT NULL,
    error_message text,
    error_details jsonb,
    phone_number text,
    waba_id text,
    channel_id character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channels (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone_number_id text NOT NULL,
    access_token text NOT NULL,
    whatsapp_business_account_id text,
    phone_number text,
    app_id text,
    is_active boolean DEFAULT true,
    is_coexistence boolean DEFAULT false,
    health_status text DEFAULT 'unknown'::text,
    last_health_check timestamp with time zone,
    health_details jsonb DEFAULT '{}'::jsonb,
    connection_method character varying(20) DEFAULT 'embedded'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by character varying DEFAULT ''::character varying
);


--
-- Name: chatbots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbots (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    uuid text NOT NULL,
    title text NOT NULL,
    bubble_message text,
    welcome_message text,
    instructions text,
    connect_message text,
    language text DEFAULT 'en'::text,
    interaction_type text DEFAULT 'ai-only'::text,
    avatar_id integer,
    avatar_emoji text,
    avatar_color text,
    primary_color text DEFAULT '#3B82F6'::text,
    logo_url text,
    embed_width integer DEFAULT 420,
    embed_height integer DEFAULT 745,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: client_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_api_keys (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    channel_id character varying,
    name character varying(100) NOT NULL,
    api_key character varying(64) NOT NULL,
    secret_hash character varying(256) NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    last_used_at timestamp with time zone,
    request_count integer DEFAULT 0,
    monthly_request_count integer DEFAULT 0,
    monthly_reset_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone
);


--
-- Name: client_api_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_api_usage_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    api_key_id character varying NOT NULL,
    user_id character varying NOT NULL,
    channel_id character varying,
    endpoint character varying(255) NOT NULL,
    method character varying(10) NOT NULL,
    status_code integer,
    response_time integer,
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: client_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_webhooks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    channel_id character varying,
    url text NOT NULL,
    secret character varying(256),
    events jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    last_triggered_at timestamp with time zone,
    failure_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying NOT NULL,
    tenant_id character varying,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    groups jsonb DEFAULT '[]'::jsonb,
    tags jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'active'::text,
    source character varying(100),
    last_contact timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by character varying,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    opt_in boolean DEFAULT true
);


--
-- Name: conversation_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_assignments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    conversation_id character varying NOT NULL,
    user_id character varying NOT NULL,
    assigned_by character varying,
    assigned_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'active'::text NOT NULL,
    priority text DEFAULT 'normal'::text,
    notes text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: conversation_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_pins (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    conversation_id character varying NOT NULL,
    channel_id character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying,
    contact_id character varying,
    assigned_to character varying,
    contact_phone character varying,
    contact_name character varying,
    status text DEFAULT 'open'::text,
    priority text DEFAULT 'normal'::text,
    type text DEFAULT 'whatsapp'::text,
    chatbot_id character varying,
    session_id text,
    tags jsonb DEFAULT '[]'::jsonb,
    unread_count integer DEFAULT 0,
    last_message_at timestamp with time zone,
    last_incoming_message_at timestamp with time zone,
    last_message_text text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: firebase_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firebase_config (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    api_key text,
    auth_domain text,
    project_id text,
    storage_bucket text,
    messaging_sender_id text,
    app_id text,
    measurement_id text,
    private_key text,
    client_email text,
    vapid_key text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "channelId" uuid,
    name character varying(255) NOT NULL,
    description text,
    created_by character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: knowledge_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_articles (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    category_id character varying NOT NULL,
    title character varying(500) NOT NULL,
    content text NOT NULL,
    "order" integer DEFAULT 0,
    published boolean DEFAULT true,
    views integer DEFAULT 0,
    helpful integer DEFAULT 0,
    not_helpful integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: knowledge_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_categories (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    site_id character varying NOT NULL,
    parent_id character varying,
    name character varying(255) NOT NULL,
    icon character varying(50),
    description text,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: message_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_queue (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    campaign_id character varying,
    channel_id character varying,
    recipient_phone character varying(20) NOT NULL,
    template_name character varying(100),
    template_language character varying(20) DEFAULT 'en_US'::character varying,
    template_params jsonb DEFAULT '[]'::jsonb,
    message_type character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'queued'::character varying,
    attempts integer DEFAULT 0,
    whatsapp_message_id character varying(100),
    conversation_id character varying(100),
    sent_via character varying(20),
    cost character varying(20),
    error_code character varying(50),
    error_message text,
    scheduled_for timestamp with time zone,
    processed_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: message_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_rates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    country_code character varying(2) NOT NULL,
    category character varying NOT NULL,
    rate numeric(10,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    conversation_id character varying,
    whatsapp_message_id character varying,
    from_user boolean DEFAULT false,
    direction character varying DEFAULT 'outbound'::character varying,
    content text NOT NULL,
    type text DEFAULT 'text'::text,
    from_type character varying DEFAULT 'user'::character varying,
    message_type character varying,
    media_id character varying,
    media_url text,
    media_mime_type character varying(100),
    media_sha256 character varying(128),
    status text DEFAULT 'sent'::text,
    "timestamp" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    error_code character varying(50),
    error_message text,
    error_details jsonb,
    campaign_id character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id integer NOT NULL,
    event_type character varying NOT NULL,
    label character varying NOT NULL,
    description text,
    subject text NOT NULL,
    html_body text NOT NULL,
    is_email_enabled boolean DEFAULT true,
    is_in_app_enabled boolean DEFAULT true,
    variables text[] DEFAULT ARRAY[]::text[],
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_templates_id_seq OWNED BY public.notification_templates.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type character varying DEFAULT 'general'::character varying NOT NULL,
    created_by character varying DEFAULT 'system'::character varying NOT NULL,
    channel_id character varying,
    target_type character varying NOT NULL,
    target_ids text[] DEFAULT ARRAY[]::text[],
    status character varying DEFAULT 'draft'::character varying NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: order_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_products (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying,
    name character varying NOT NULL,
    price numeric(12,2) DEFAULT 0 NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying NOT NULL,
    contact_phone character varying NOT NULL,
    step character varying DEFAULT 'idle'::character varying NOT NULL,
    pending_product_id character varying,
    cart jsonb DEFAULT '[]'::jsonb,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying NOT NULL,
    contact_phone character varying NOT NULL,
    contact_name character varying,
    items jsonb NOT NULL,
    total numeric(12,2) NOT NULL,
    status character varying DEFAULT 'new'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: otp_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_verifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    otp_code character varying(6) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: panel_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.panel_config (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    tagline character varying,
    description text,
    logo character varying,
    logo2 character varying,
    favicon character varying,
    default_language character varying(5) DEFAULT 'en'::character varying,
    supported_languages jsonb DEFAULT '["en"]'::jsonb,
    company_name character varying,
    company_website character varying,
    support_email character varying,
    currency character varying(10) DEFAULT 'INR'::character varying,
    country character varying(2) DEFAULT 'IN'::character varying,
    embedded_signup_enabled boolean DEFAULT true,
    public_origin text,
    appearance_config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: payment_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_providers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    provider_key character varying NOT NULL,
    description text,
    logo character varying,
    is_active boolean DEFAULT true,
    config jsonb,
    supported_currencies jsonb,
    supported_methods jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    icon character varying,
    popular boolean DEFAULT false,
    badge character varying,
    color character varying,
    button_color character varying,
    monthly_price numeric(10,2) DEFAULT '0'::numeric,
    annual_price numeric(10,2) DEFAULT '0'::numeric,
    multi_currency_prices jsonb,
    permissions jsonb,
    features jsonb,
    stripe_product_id character varying,
    stripe_price_id_monthly character varying,
    stripe_price_id_annual character varying,
    razorpay_plan_id_monthly character varying,
    razorpay_plan_id_annual character varying,
    paypal_product_id character varying,
    paypal_plan_id_monthly character varying,
    paypal_plan_id_annual character varying,
    paystack_plan_code_monthly character varying,
    paystack_plan_code_annual character varying,
    mercadopago_plan_id_monthly character varying,
    mercadopago_plan_id_annual character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    quarterly_price numeric(10,2) DEFAULT '0'::numeric,
    stripe_price_id_quarterly character varying,
    razorpay_plan_id_quarterly character varying,
    paypal_plan_id_quarterly character varying,
    paystack_plan_code_quarterly character varying,
    mercadopago_plan_id_quarterly character varying
);


--
-- Name: platform_languages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_languages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(100) NOT NULL,
    native_name character varying(100) NOT NULL,
    icon character varying(10),
    direction character varying(3) DEFAULT 'ltr'::character varying NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    translations jsonb DEFAULT '{}'::jsonb,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sent_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sent_notifications (
    id integer NOT NULL,
    notification_id integer NOT NULL,
    user_id character varying,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    sent_at timestamp with time zone DEFAULT now()
);


--
-- Name: sent_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sent_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sent_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sent_notifications_id_seq OWNED BY public.sent_notifications.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sites (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying,
    name text NOT NULL,
    domain text NOT NULL,
    widget_code text NOT NULL,
    widget_enabled boolean DEFAULT true NOT NULL,
    widget_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    ai_training_config jsonb DEFAULT '{"trainFromKB": false, "trainFromDocuments": true}'::jsonb NOT NULL,
    auto_assignment_config jsonb DEFAULT '{"enabled": false, "strategy": "round_robin"}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: smtp_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smtp_config (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    host text NOT NULL,
    port integer NOT NULL,
    secure boolean DEFAULT false,
    "user" text NOT NULL,
    password text,
    from_name text NOT NULL,
    from_email text NOT NULL,
    logo text DEFAULT 'null'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: storage_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'digitalocean'::text,
    space_name text NOT NULL,
    endpoint text NOT NULL,
    region text NOT NULL,
    access_key text NOT NULL,
    secret_key text NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    plan_id character varying,
    plan_data jsonb NOT NULL,
    status character varying NOT NULL,
    billing_cycle character varying NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    auto_renew boolean DEFAULT true,
    gateway_subscription_id character varying,
    gateway_provider character varying,
    gateway_status character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    status public.ticket_status DEFAULT 'open'::public.ticket_status NOT NULL,
    priority public.ticket_priority DEFAULT 'medium'::public.ticket_priority NOT NULL,
    creator_id character varying NOT NULL,
    creator_type public.user_type NOT NULL,
    creator_name text NOT NULL,
    creator_email text NOT NULL,
    assigned_to_id character varying,
    assigned_to_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone
);


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying NOT NULL,
    created_by character varying,
    name text NOT NULL,
    category text NOT NULL,
    language text DEFAULT 'en_US'::text,
    header text,
    body text NOT NULL,
    footer text,
    buttons jsonb DEFAULT '[]'::jsonb,
    variables jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'draft'::text,
    rejection_reason text,
    media_type text DEFAULT 'text'::text,
    media_url text,
    media_handle text,
    carousel_cards jsonb DEFAULT '[]'::jsonb,
    whatsapp_template_id text,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    header_type text,
    body_variables integer
);


--
-- Name: ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    ticket_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    sender_type public.user_type NOT NULL,
    sender_name text NOT NULL,
    message text NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_chunks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    source_id character varying NOT NULL,
    site_id character varying NOT NULL,
    content text NOT NULL,
    embedding jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: training_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_data (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    chatbot_id character varying,
    type text NOT NULL,
    title text,
    content text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: training_qa_pairs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_qa_pairs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    site_id character varying NOT NULL,
    channel_id character varying,
    question text NOT NULL,
    answer text NOT NULL,
    category text DEFAULT 'general'::text,
    embedding jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: training_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_sources (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    site_id character varying NOT NULL,
    channel_id character varying,
    type text NOT NULL,
    name text NOT NULL,
    url text,
    content text,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    chunk_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    plan_id character varying,
    subscription_id character varying,
    payment_provider_id character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying DEFAULT 'USD'::character varying,
    billing_cycle character varying NOT NULL,
    provider_transaction_id character varying,
    provider_order_id character varying,
    provider_payment_id character varying,
    provider_subscription_id character varying,
    provider_payment_intent_id character varying,
    provider_setup_intent_id character varying,
    provider_invoice_id character varying,
    provider_customer_id character varying,
    status character varying NOT NULL,
    payment_method character varying,
    metadata jsonb,
    paid_at timestamp with time zone,
    refunded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: update_run_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.update_run_events (
    id integer NOT NULL,
    run_id character varying NOT NULL,
    step character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    message text NOT NULL,
    progress integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: update_run_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.update_run_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: update_run_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.update_run_events_id_seq OWNED BY public.update_run_events.id;


--
-- Name: update_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.update_runs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    triggered_by character varying,
    triggered_by_username text,
    from_version text,
    to_version text,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    final_message text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);


--
-- Name: user_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    action text NOT NULL,
    entity_type text,
    entity_id character varying,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_group_members (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    group_id character varying NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_groups (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#6366f1'::text,
    created_by character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    permissions text[] DEFAULT '{}'::text[]
);


--
-- Name: user_notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_preferences (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    event_type character varying NOT NULL,
    in_app_enabled boolean DEFAULT true,
    email_enabled boolean DEFAULT true,
    sound_enabled boolean DEFAULT true
);


--
-- Name: user_notification_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_notification_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_notification_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_notification_preferences_id_seq OWNED BY public.user_notification_preferences.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    email text NOT NULL,
    first_name text,
    last_name text,
    role text DEFAULT 'admin'::text NOT NULL,
    avatar text,
    status text DEFAULT 'active'::text NOT NULL,
    permissions text[] NOT NULL,
    channel_id character varying,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by character varying,
    fcm_token character varying(512),
    is_email_verified boolean DEFAULT false,
    stripe_customer_id character varying,
    razorpay_customer_id character varying,
    paypal_customer_id character varying,
    paystack_customer_code character varying,
    mercadopago_customer_id character varying,
    wallet_balance numeric(12,4) DEFAULT '0'::numeric,
    channel_limit integer DEFAULT 1
);


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transactions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type character varying NOT NULL,
    amount numeric(12,4) NOT NULL,
    balance_after numeric(12,4) NOT NULL,
    message_id character varying,
    country character varying(2),
    category character varying,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_configs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    channel_id character varying,
    webhook_url text NOT NULL,
    verify_token character varying(100) NOT NULL,
    events jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    last_ping_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_dedup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_dedup (
    wamid character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_business_accounts_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_business_accounts_config (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    app_id text NOT NULL,
    app_secret text NOT NULL,
    config_id text NOT NULL,
    created_by character varying DEFAULT ''::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: whatsapp_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_channels (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone_number character varying(20) NOT NULL,
    phone_number_id character varying(50) NOT NULL,
    waba_id character varying(50) NOT NULL,
    access_token text NOT NULL,
    business_account_id character varying(50),
    rate_limit_tier character varying(20) DEFAULT 'standard'::character varying,
    quality_rating character varying(20) DEFAULT 'green'::character varying,
    status character varying(20) DEFAULT 'inactive'::character varying,
    error_message text,
    last_health_check timestamp with time zone,
    message_limit integer,
    messages_used integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates ALTER COLUMN id SET DEFAULT nextval('public.notification_templates_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: sent_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sent_notifications ALTER COLUMN id SET DEFAULT nextval('public.sent_notifications_id_seq'::regclass);


--
-- Name: update_run_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update_run_events ALTER COLUMN id SET DEFAULT nextval('public.update_run_events_id_seq'::regclass);


--
-- Name: user_notification_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_preferences ALTER COLUMN id SET DEFAULT nextval('public.user_notification_preferences_id_seq'::regclass);


--
-- Name: ai_settings ai_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_settings
    ADD CONSTRAINT ai_settings_pkey PRIMARY KEY (id);


--
-- Name: analytics analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics
    ADD CONSTRAINT analytics_pkey PRIMARY KEY (id);


--
-- Name: api_logs api_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_logs
    ADD CONSTRAINT api_logs_pkey PRIMARY KEY (id);


--
-- Name: app_features app_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_features
    ADD CONSTRAINT app_features_pkey PRIMARY KEY (id);


--
-- Name: automation_edges automation_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_edges
    ADD CONSTRAINT automation_edges_pkey PRIMARY KEY (id);


--
-- Name: automation_edges automation_edges_unique_handle_idx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_edges
    ADD CONSTRAINT automation_edges_unique_handle_idx UNIQUE (automation_id, source_node_id, target_node_id, source_handle);


--
-- Name: automation_execution_logs automation_execution_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_execution_logs
    ADD CONSTRAINT automation_execution_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_executions automation_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_executions
    ADD CONSTRAINT automation_executions_pkey PRIMARY KEY (id);


--
-- Name: automation_nodes automation_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_nodes
    ADD CONSTRAINT automation_nodes_pkey PRIMARY KEY (id);


--
-- Name: automation_nodes automation_nodes_unique_idx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_nodes
    ADD CONSTRAINT automation_nodes_unique_idx UNIQUE (automation_id, node_id);


--
-- Name: automations automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_pkey PRIMARY KEY (id);


--
-- Name: billing_settings billing_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_settings
    ADD CONSTRAINT billing_settings_pkey PRIMARY KEY (id);


--
-- Name: campaign_recipients campaign_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_phone_unique UNIQUE (campaign_id, phone);


--
-- Name: campaign_recipients campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: channel_signup_logs channel_signup_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_signup_logs
    ADD CONSTRAINT channel_signup_logs_pkey PRIMARY KEY (id);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: chatbots chatbots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbots
    ADD CONSTRAINT chatbots_pkey PRIMARY KEY (id);


--
-- Name: chatbots chatbots_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbots
    ADD CONSTRAINT chatbots_uuid_unique UNIQUE (uuid);


--
-- Name: client_api_keys client_api_keys_api_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_api_keys
    ADD CONSTRAINT client_api_keys_api_key_unique UNIQUE (api_key);


--
-- Name: client_api_keys client_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_api_keys
    ADD CONSTRAINT client_api_keys_pkey PRIMARY KEY (id);


--
-- Name: client_api_usage_logs client_api_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_api_usage_logs
    ADD CONSTRAINT client_api_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: client_webhooks client_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_webhooks
    ADD CONSTRAINT client_webhooks_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_channel_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_channel_phone_unique UNIQUE (channel_id, phone);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversation_assignments conversation_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_assignments
    ADD CONSTRAINT conversation_assignments_pkey PRIMARY KEY (id);


--
-- Name: conversation_pins conversation_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_pins
    ADD CONSTRAINT conversation_pins_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: firebase_config firebase_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firebase_config
    ADD CONSTRAINT firebase_config_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: knowledge_articles knowledge_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_articles
    ADD CONSTRAINT knowledge_articles_pkey PRIMARY KEY (id);


--
-- Name: knowledge_categories knowledge_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_categories
    ADD CONSTRAINT knowledge_categories_pkey PRIMARY KEY (id);


--
-- Name: message_queue message_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_queue
    ADD CONSTRAINT message_queue_pkey PRIMARY KEY (id);


--
-- Name: message_rates message_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_rates
    ADD CONSTRAINT message_rates_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_event_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_event_type_unique UNIQUE (event_type);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_products order_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_products
    ADD CONSTRAINT order_products_pkey PRIMARY KEY (id);


--
-- Name: order_sessions order_sessions_channel_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_sessions
    ADD CONSTRAINT order_sessions_channel_phone_unique UNIQUE (channel_id, contact_phone);


--
-- Name: order_sessions order_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_sessions
    ADD CONSTRAINT order_sessions_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: otp_verifications otp_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_verifications
    ADD CONSTRAINT otp_verifications_pkey PRIMARY KEY (id);


--
-- Name: panel_config panel_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.panel_config
    ADD CONSTRAINT panel_config_pkey PRIMARY KEY (id);


--
-- Name: payment_providers payment_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_providers
    ADD CONSTRAINT payment_providers_pkey PRIMARY KEY (id);


--
-- Name: payment_providers payment_providers_provider_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_providers
    ADD CONSTRAINT payment_providers_provider_key_unique UNIQUE (provider_key);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: platform_languages platform_languages_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_languages
    ADD CONSTRAINT platform_languages_code_unique UNIQUE (code);


--
-- Name: platform_languages platform_languages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_languages
    ADD CONSTRAINT platform_languages_pkey PRIMARY KEY (id);


--
-- Name: sent_notifications sent_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sent_notifications
    ADD CONSTRAINT sent_notifications_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: sites sites_widget_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_widget_code_unique UNIQUE (widget_code);


--
-- Name: smtp_config smtp_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smtp_config
    ADD CONSTRAINT smtp_config_pkey PRIMARY KEY (id);


--
-- Name: storage_settings storage_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_settings
    ADD CONSTRAINT storage_settings_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: templates template_channel_wa_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT template_channel_wa_id_unique UNIQUE (whatsapp_template_id, channel_id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: ticket_messages ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: training_chunks training_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_chunks
    ADD CONSTRAINT training_chunks_pkey PRIMARY KEY (id);


--
-- Name: training_data training_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_data
    ADD CONSTRAINT training_data_pkey PRIMARY KEY (id);


--
-- Name: training_qa_pairs training_qa_pairs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_qa_pairs
    ADD CONSTRAINT training_qa_pairs_pkey PRIMARY KEY (id);


--
-- Name: training_sources training_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_sources
    ADD CONSTRAINT training_sources_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: update_run_events update_run_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update_run_events
    ADD CONSTRAINT update_run_events_pkey PRIMARY KEY (id);


--
-- Name: update_runs update_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update_runs
    ADD CONSTRAINT update_runs_pkey PRIMARY KEY (id);


--
-- Name: user_activity_logs user_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_logs
    ADD CONSTRAINT user_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: user_group_members user_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (id);


--
-- Name: user_notification_preferences user_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: webhook_configs webhook_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_configs
    ADD CONSTRAINT webhook_configs_pkey PRIMARY KEY (id);


--
-- Name: webhook_dedup webhook_dedup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_dedup
    ADD CONSTRAINT webhook_dedup_pkey PRIMARY KEY (wamid);


--
-- Name: whatsapp_business_accounts_config whatsapp_business_accounts_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_business_accounts_config
    ADD CONSTRAINT whatsapp_business_accounts_config_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_channels whatsapp_channels_phone_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_channels
    ADD CONSTRAINT whatsapp_channels_phone_number_unique UNIQUE (phone_number);


--
-- Name: whatsapp_channels whatsapp_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_channels
    ADD CONSTRAINT whatsapp_channels_pkey PRIMARY KEY (id);


--
-- Name: articles_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_category_idx ON public.knowledge_articles USING btree (category_id);


--
-- Name: articles_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_published_idx ON public.knowledge_articles USING btree (published);


--
-- Name: automation_edges_automation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_edges_automation_idx ON public.automation_edges USING btree (automation_id);


--
-- Name: automation_execution_logs_execution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_execution_logs_execution_idx ON public.automation_execution_logs USING btree (execution_id);


--
-- Name: automation_executions_automation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_executions_automation_idx ON public.automation_executions USING btree (automation_id);


--
-- Name: automation_executions_message_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX automation_executions_message_unique_idx ON public.automation_executions USING btree (automation_id, conversation_id, trigger_message_id);


--
-- Name: automation_executions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_executions_status_idx ON public.automation_executions USING btree (status);


--
-- Name: automation_nodes_automation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_nodes_automation_idx ON public.automation_nodes USING btree (automation_id);


--
-- Name: automations_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automations_channel_idx ON public.automations USING btree (channel_id);


--
-- Name: automations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automations_status_idx ON public.automations USING btree (status);


--
-- Name: campaigns_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_channel_idx ON public.campaigns USING btree (channel_id);


--
-- Name: campaigns_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_created_idx ON public.campaigns USING btree (created_at);


--
-- Name: campaigns_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_status_idx ON public.campaigns USING btree (status);


--
-- Name: categories_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX categories_parent_idx ON public.knowledge_categories USING btree (parent_id);


--
-- Name: categories_site_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX categories_site_idx ON public.knowledge_categories USING btree (site_id);


--
-- Name: contacts_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_channel_idx ON public.contacts USING btree (channel_id);


--
-- Name: contacts_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_phone_idx ON public.contacts USING btree (phone);


--
-- Name: contacts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_status_idx ON public.contacts USING btree (status);


--
-- Name: contacts_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_tenant_idx ON public.contacts USING btree (tenant_id);


--
-- Name: conversation_pins_user_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_pins_user_channel_idx ON public.conversation_pins USING btree (user_id, channel_id);


--
-- Name: conversation_pins_user_conv_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversation_pins_user_conv_uniq ON public.conversation_pins USING btree (user_id, conversation_id);


--
-- Name: conversation_pins_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_pins_user_idx ON public.conversation_pins USING btree (user_id);


--
-- Name: conversations_assigned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_assigned_idx ON public.conversations USING btree (assigned_to);


--
-- Name: conversations_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_channel_idx ON public.conversations USING btree (channel_id);


--
-- Name: conversations_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_contact_idx ON public.conversations USING btree (contact_id);


--
-- Name: conversations_last_msg_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_last_msg_at_idx ON public.conversations USING btree (last_message_at);


--
-- Name: conversations_last_msg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_last_msg_idx ON public.conversations USING btree (channel_id, last_message_at);


--
-- Name: conversations_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_phone_idx ON public.conversations USING btree (contact_phone);


--
-- Name: conversations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_status_idx ON public.conversations USING btree (status);


--
-- Name: message_rates_country_category_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX message_rates_country_category_unique ON public.message_rates USING btree (country_code, category);


--
-- Name: messages_conv_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conv_created_idx ON public.messages USING btree (conversation_id, created_at);


--
-- Name: messages_conv_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conv_status_created_idx ON public.messages USING btree (conversation_id, status, created_at);


--
-- Name: messages_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conversation_idx ON public.messages USING btree (conversation_id);


--
-- Name: messages_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_created_idx ON public.messages USING btree (created_at);


--
-- Name: messages_direction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_direction_idx ON public.messages USING btree (direction);


--
-- Name: messages_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_status_idx ON public.messages USING btree (status);


--
-- Name: messages_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_timestamp_idx ON public.messages USING btree ("timestamp");


--
-- Name: messages_whatsapp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_whatsapp_idx ON public.messages USING btree (whatsapp_message_id);


--
-- Name: notifications_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_channel_idx ON public.notifications USING btree (channel_id);


--
-- Name: recipients_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recipients_campaign_idx ON public.campaign_recipients USING btree (campaign_id);


--
-- Name: recipients_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recipients_phone_idx ON public.campaign_recipients USING btree (phone);


--
-- Name: recipients_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recipients_status_idx ON public.campaign_recipients USING btree (status);


--
-- Name: templates_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_channel_idx ON public.templates USING btree (channel_id);


--
-- Name: training_data_chatbot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_data_chatbot_idx ON public.training_data USING btree (chatbot_id);


--
-- Name: update_run_events_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX update_run_events_run_id_idx ON public.update_run_events USING btree (run_id, id);


--
-- Name: update_runs_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX update_runs_started_at_idx ON public.update_runs USING btree (started_at);


--
-- Name: users_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_created_by_idx ON public.users USING btree (created_by);


--
-- Name: users_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_role_idx ON public.users USING btree (role);


--
-- Name: wallet_tx_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_tx_user_idx ON public.wallet_transactions USING btree (user_id);


--
-- Name: webhook_dedup_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_dedup_created_at_idx ON public.webhook_dedup USING btree (created_at);


--
-- Name: ai_settings ai_settings_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_settings
    ADD CONSTRAINT ai_settings_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: api_logs api_logs_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_logs
    ADD CONSTRAINT api_logs_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: automation_edges automation_edges_automation_id_automations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_edges
    ADD CONSTRAINT automation_edges_automation_id_automations_id_fk FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- Name: automation_execution_logs automation_execution_logs_execution_id_automation_executions_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_execution_logs
    ADD CONSTRAINT automation_execution_logs_execution_id_automation_executions_id FOREIGN KEY (execution_id) REFERENCES public.automation_executions(id) ON DELETE CASCADE;


--
-- Name: automation_executions automation_executions_automation_id_automations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_executions
    ADD CONSTRAINT automation_executions_automation_id_automations_id_fk FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- Name: automation_executions automation_executions_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_executions
    ADD CONSTRAINT automation_executions_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: automation_executions automation_executions_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_executions
    ADD CONSTRAINT automation_executions_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: automation_nodes automation_nodes_automation_id_automations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_nodes
    ADD CONSTRAINT automation_nodes_automation_id_automations_id_fk FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- Name: automations automations_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: automations automations_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: campaign_recipients campaign_recipients_campaign_id_campaigns_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_recipients campaign_recipients_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_template_id_templates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id);


--
-- Name: client_api_keys client_api_keys_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_api_keys
    ADD CONSTRAINT client_api_keys_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: client_api_keys client_api_keys_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_api_keys
    ADD CONSTRAINT client_api_keys_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: client_api_usage_logs client_api_usage_logs_api_key_id_client_api_keys_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_api_usage_logs
    ADD CONSTRAINT client_api_usage_logs_api_key_id_client_api_keys_id_fk FOREIGN KEY (api_key_id) REFERENCES public.client_api_keys(id);


--
-- Name: client_api_usage_logs client_api_usage_logs_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_api_usage_logs
    ADD CONSTRAINT client_api_usage_logs_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: client_api_usage_logs client_api_usage_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_api_usage_logs
    ADD CONSTRAINT client_api_usage_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: client_webhooks client_webhooks_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_webhooks
    ADD CONSTRAINT client_webhooks_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: client_webhooks client_webhooks_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_webhooks
    ADD CONSTRAINT client_webhooks_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: contacts contacts_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: conversation_assignments conversation_assignments_assigned_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_assignments
    ADD CONSTRAINT conversation_assignments_assigned_by_users_id_fk FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversation_assignments conversation_assignments_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_assignments
    ADD CONSTRAINT conversation_assignments_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_assignments conversation_assignments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_assignments
    ADD CONSTRAINT conversation_assignments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversation_pins conversation_pins_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_pins
    ADD CONSTRAINT conversation_pins_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: conversation_pins conversation_pins_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_pins
    ADD CONSTRAINT conversation_pins_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_pins conversation_pins_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_pins
    ADD CONSTRAINT conversation_pins_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_assigned_to_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_assigned_to_users_id_fk FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: knowledge_categories knowledge_categories_site_id_sites_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_categories
    ADD CONSTRAINT knowledge_categories_site_id_sites_id_fk FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: message_queue message_queue_campaign_id_campaigns_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_queue
    ADD CONSTRAINT message_queue_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id);


--
-- Name: message_queue message_queue_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_queue
    ADD CONSTRAINT message_queue_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: messages messages_campaign_id_campaigns_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: messages messages_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE SET NULL;


--
-- Name: sent_notifications sent_notifications_notification_id_notifications_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sent_notifications
    ADD CONSTRAINT sent_notifications_notification_id_notifications_id_fk FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_plans_id_fk FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: templates templates_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: templates templates_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ticket_messages ticket_messages_ticket_id_support_tickets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_ticket_id_support_tickets_id_fk FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: training_data training_data_chatbot_id_chatbots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_data
    ADD CONSTRAINT training_data_chatbot_id_chatbots_id_fk FOREIGN KEY (chatbot_id) REFERENCES public.chatbots(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_payment_provider_id_payment_providers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_payment_provider_id_payment_providers_id_fk FOREIGN KEY (payment_provider_id) REFERENCES public.payment_providers(id);


--
-- Name: transactions transactions_plan_id_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_plan_id_plans_id_fk FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_subscription_id_subscriptions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_subscription_id_subscriptions_id_fk FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);


--
-- Name: transactions transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: update_run_events update_run_events_run_id_update_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update_run_events
    ADD CONSTRAINT update_run_events_run_id_update_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.update_runs(id) ON DELETE CASCADE;


--
-- Name: update_runs update_runs_triggered_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update_runs
    ADD CONSTRAINT update_runs_triggered_by_users_id_fk FOREIGN KEY (triggered_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_activity_logs user_activity_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_logs
    ADD CONSTRAINT user_activity_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_group_members user_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


--
-- Name: user_group_members user_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_channel_id_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_channel_id_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE SET NULL;


--
-- Name: users users_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: wallet_transactions wallet_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict fdymBbH5dvjls3pN70Ud5I7IauB8SPjNYKPdaHQI1SrM7ryTAdaVA9XdblAV4AB


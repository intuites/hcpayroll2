create table candidates (
  id uuid primary key default gen_random_uuid(),

  candidate_name text not null,
  start_date date not null,
  end_date date not null,
  work_location text,
  position text,
  client text,
  shift text,
  hours integer,

  w2_rate numeric,
  job_type text,
  ot_rate numeric,
  holiday_rate numeric,
  sign_bonus numeric,

  created_at timestamp default now()
);

create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  created_at timestamp default now()
);

export interface UniversityInfo {
  code: string;
  name: string;
  short_name: string | null;
  location: string[];
  address: string | null;
  website: string | null;
  type: string | null;
  description: string | null;
}

export interface ProgramInfo {
  program_code: string;
  program_name: string;
  subject_groups: string[];
  program_type: string;
  note: string | null;
}

export interface AdmissionMethod {
  method_id: string;
  method_name: string;
  description: string | null;
  eligibility: string | null;
  rules: string | null;
  programs: ProgramInfo[];
}

export interface UniversityAdmissionData {
  university: UniversityInfo;
  admission_year: number | null;
  total_quota: number | null;
  source_url: string;
  pdf_url: string | null;
  admission_overview: string | null;
  admission_methods: AdmissionMethod[];
  cutoff_scores_text: string | null;
  tuition_text: string | null;
  timeline_text: string | null;
}

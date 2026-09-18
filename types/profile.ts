export interface PatientProfile {
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  address?: string;
  bloodType?: string;
  allergies?: string;
  medications?: string;
  medicalConditions?: string;
  medicalNotes?: string;
}

export interface UpdatePatientProfileInput {
  fullName: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  address?: string;
  bloodType?: string;
  allergies?: string;
  medications?: string;
  medicalConditions?: string;
  medicalNotes?: string;
}

export interface DoctorProfile {
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  specialty: string;
  department: string;
  bio?: string;
  yearsExperience: number;
  consultationFee: number;
}

export interface UpdateDoctorProfileInput {
  fullName: string;
  phone?: string;
  specialty: string;
  bio?: string;
  yearsExperience: number;
  consultationFee: number;
}

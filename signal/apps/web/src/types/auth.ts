export interface User {
  id: string;
  email: string;
  tier: "Free" | "Analyst" | "Pro";
  subscription?: {
    billingCycle: "monthly" | "annual";
    status: "active" | "cancelled";
  };
  starredTheses: string[];
  preferences: {
    alertsEnabled: boolean;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface SignupCredentials {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface AuthSession {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export type UserTier = "Free" | "Analyst" | "Pro";
export type BillingCycle = "monthly" | "annual";
export type SubscriptionStatus = "active" | "cancelled";

export interface User {
  id: string;
  email: string;
  tier: UserTier;
  subscription?: {
    billingCycle: BillingCycle;
    status: SubscriptionStatus;
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

export interface AuthResponse {
  user: User;
  token: string;
}

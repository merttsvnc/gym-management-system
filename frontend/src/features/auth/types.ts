export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN';
  tenantId: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}


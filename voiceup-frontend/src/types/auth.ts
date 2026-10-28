export type User = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: string;
  updatedAt: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  data: {
    user: User;
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: number;
  };
};

export type RegisterRequest = {
  name: string;
  email: string;
  password: string;
};

export type RegisterResponse = LoginResponse;
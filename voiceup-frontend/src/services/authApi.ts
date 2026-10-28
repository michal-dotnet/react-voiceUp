import type { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse } from "../types/auth";

const API_URL = import.meta.env.VITE_API_URL;

import type { User } from "../types/auth";

type CurrentUserResponse = {
  data: User;
};

 const getCurrentUser = async (
  token: string
): Promise<CurrentUserResponse> => {
  const response = await fetch(`${API_URL}/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

if (!response.ok) {
  throw Object.assign(
    new Error("Failed to fetch current user"),
    { status: response.status }
  );
}

  return response.json();
};

const  LoginAuth =async (userdata: LoginRequest) : Promise<LoginResponse>=> {
    const response = await fetch(`${API_URL}/auth/login`, {
        method:"POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(userdata), 
     }    
    )
   
      if (!response.ok) {
    throw new Error("Login failed");
  }

  return response.json() as Promise<LoginResponse>;


}

 const registerAuth = async (
  userData: RegisterRequest
): Promise<RegisterResponse> => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    throw new Error("Registration failed");
  }

  return response.json();
};
export  {LoginAuth,getCurrentUser,registerAuth}

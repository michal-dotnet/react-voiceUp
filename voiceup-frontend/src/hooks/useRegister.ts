import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import useAuth from "./useAuth";
import { registerAuth } from "../services/authApi";

const useRegister = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: registerAuth,

    onSuccess: (response) => {
      auth.login(response.data.accessToken, response.data.user);
      navigate("/");
    },
  });
};

export default useRegister;
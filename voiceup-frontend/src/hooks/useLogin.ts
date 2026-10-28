import { useMutation } from "@tanstack/react-query"
import useAuth from "./useAuth";
import { useNavigate } from "react-router";
import { LoginAuth } from "../services/authApi";

 const UseLogin = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: LoginAuth,
    onSuccess: (response) => {
  auth.login(response.data.accessToken,response.data.user);
  navigate("/");
}


  });
};
export default UseLogin
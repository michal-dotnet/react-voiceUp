import { useContext } from "react";
import { AuthContext } from "../context/authContextDefinition";

 const useAuth = () => {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
export default useAuth
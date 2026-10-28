import { NavLink } from "react-router";
import WaveLogo from "./design/WaveLogo";
import useAuth from "../hooks/useAuth";

const Header = () => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="vu-header">
      <nav aria-label="Main navigation" className="vu-nav">
        <NavLink to="/" className="vu-logo"><WaveLogo /><span dir="ltr">Voice<span className="vu-logo-accent">Up</span></span></NavLink>


        {isAuthenticated ? (
          <>
            <span>שלום, {user?.name}</span>
            <button type="button" onClick={logout}>
              התנתקות
            </button>
            {user?.role === "USER" && (
              <>
                <NavLink to="/my-issues">הדיווחים שלי</NavLink>
                <NavLink to="/issues/new">+ דיווח חדש</NavLink>
              </>)}
            {user?.role === "ADMIN" && (
              <NavLink to="/admin/issues">ניהול דיווחים</NavLink>
            )}

          </>
        ) : (
          <>
            <NavLink to="/login">התחברות</NavLink>
            <NavLink to="/register">הרשמה</NavLink>

          </>
        )}
        <NavLink to="/IssuesPage">כל הדיווחים</NavLink>

      </nav>
    </header>
  );
};

export default Header;
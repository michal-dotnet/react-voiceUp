import { Route, Routes } from "react-router"
import Home from "../pages/Home"
import Login from "../pages/Login"
import ProtectedRoute from "../components/ProtectedRoute"
import Register from "../pages/Register"
import IssuesPage from "../pages/IssuesPage"
import MyIssuesPage from "../pages/MyIssuesPage"
import CreateIssuePage from "../pages/CreateIssuePage"
import EditIssuePage from "../pages/EditIssuePage"
import AdminIssuesPage from "../pages/AdminIssuesPage"

const Router = () => {

    return (<>

        <Routes>
            <Route element={<ProtectedRoute />}>
                <Route path="/my-issues" element={<MyIssuesPage />} />
                <Route path="/issues/new" element={<CreateIssuePage />} />
                <Route path="/issues/:id/edit" element={<EditIssuePage />} />
            </Route>
            <Route element={<ProtectedRoute requiredRole="ADMIN" />}>
                <Route path="/admin/issues" element={<AdminIssuesPage />} />
            </Route>
            <Route path="/" element={<Home />} />
            <Route path="/Login" element={<Login />} />
            <Route path="/Register" element={<Register />} />
            <Route path="/IssuesPage" element={<IssuesPage />} />
        </Routes>
    </>)
}
export default Router
import { Route, Routes } from "react-router-dom";
import PublicLayout from "./components/PublicLayout";
import WorkspaceLayout from "./components/WorkspaceLayout";
import RequireAuth from "./components/RequireAuth";
import SignIn from "./pages/auth/SignIn";
import SignUp from "./pages/auth/SignUp";
import CompleteProfile from "./pages/auth/CompleteProfile";
import NotFound from "./pages/NotFound";

export default function App() {
    return (
        <Routes>
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/complete-profile" element={<CompleteProfile />} />

            <Route element={<PublicLayout />}>
                <Route path="*" element={<NotFound />} />
            </Route>

            <Route element={<RequireAuth />}>
                <Route element={<WorkspaceLayout />} />
            </Route>
        </Routes>
    );
}

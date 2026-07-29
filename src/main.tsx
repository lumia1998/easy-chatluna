import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { ThemeProvider } from "@/components/ui/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createHashRouter, RouterProvider } from "react-router";
import ProjectsPage from "./pages/app";
import HomePage from "./pages/home";
import ChatPage from "./pages/chat";
import CharacterEditPage from "./pages/character/page";
import NotFoundPage from "./pages/not-found";
import { MainLayout } from "./components/main-layout";
import { PresetWorkspace } from "./components/preset-workspace";



const router = createHashRouter([
    {
        path: "/",
        element: <HomePage />,
    },
    {
        path: "/chat",
        element: <ChatPage />,
    },
    {
        path: "/create/main",
        element: <PresetWorkspace type="main" />,
    },
    {
        path: "/create/character",
        element: <PresetWorkspace type="character" />,
    },
    {
        element: <MainLayout />,
        children: [
            {
                path: "/projects",
                element: <ProjectsPage />,
            },
            {
                path: "character/:id/:mode?/:tab?",
                element: <CharacterEditPage />,
            },
        ],
    },
    {
        path: "*",
        element: <NotFoundPage />,
    },
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider>
            <TooltipProvider>
                <RouterProvider router={router}></RouterProvider>
            </TooltipProvider>
        </ThemeProvider>
    </StrictMode>
);

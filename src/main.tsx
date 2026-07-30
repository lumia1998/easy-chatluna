/* eslint-disable react-refresh/only-export-components */
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { ThemeProvider } from "@/components/ui/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createHashRouter, Navigate, RouterProvider } from "react-router";
import {
    hydrateAIModelConfigSecrets,
    loadAIModelConfigStore,
} from "@/lib/ai/model-config";
const ProjectsPage = lazy(() => import("./pages/app"));
const HomePage = lazy(() => import("./pages/home"));
const CharacterEditPage = lazy(() => import("./pages/character/page"));
const NotFoundPage = lazy(() => import("./pages/not-found"));
const MainLayout = lazy(() =>
    import("./components/main-layout").then((module) => ({
        default: module.MainLayout,
    })),
);
const router = createHashRouter([
    {
        path: "/",
        element: <HomePage />,
    },
    {
        path: "/chat",
        element: <Navigate to="/" replace />,
    },
    {
        path: "/create/main",
        element: <Navigate to="/" replace />,
    },
    {
        path: "/create/character",
        element: <Navigate to="/" replace />,
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

void hydrateAIModelConfigSecrets()
    .catch(() => undefined)
    .then(() => {
        loadAIModelConfigStore();
        createRoot(document.getElementById("root")!).render(
            <StrictMode>
                <ThemeProvider>
                    <TooltipProvider>
                        <Suspense
                            fallback={
                                <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
                                    正在加载...
                                </div>
                            }
                        >
                            <RouterProvider router={router}></RouterProvider>
                        </Suspense>
                    </TooltipProvider>
                </ThemeProvider>
            </StrictMode>
        );
    });

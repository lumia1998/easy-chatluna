/* eslint-disable react-refresh/only-export-components */
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeProvider } from "@/components/ui/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createHashRouter, Navigate, RouterProvider } from "react-router";
import {
    hydrateAIModelConfigSecrets,
    loadAIModelConfigStore,
} from "@/lib/ai/model-config";
import { probeStorage } from "@/lib/database";
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

function StorageUnavailable({ detail }: { detail: string }) {
    return (
        <div className="flex min-h-screen items-center justify-center p-6">
            <div
                role="alert"
                className="max-w-md space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-6"
            >
                <h1 className="text-base font-medium">无法访问本地存储</h1>
                <p className="text-sm text-muted-foreground">
                    预设全部保存在浏览器本地数据库中，当前无法打开，因此编辑内容不会被保存。
                    常见原因是隐私模式浏览、站点数据被禁用，或存储空间已满。
                </p>
                <p className="text-sm text-muted-foreground">
                    请退出隐私模式、允许本站存储数据后重新打开页面。
                </p>
                <p className="text-xs text-muted-foreground/80">{detail}</p>
            </div>
        </div>
    );
}

void hydrateAIModelConfigSecrets()
    .catch(() => undefined)
    .then(async () => {
        loadAIModelConfigStore();
        const storage = await probeStorage();
        if (!storage.ok) {
            createRoot(document.getElementById("root")!).render(
                <StrictMode>
                    <ThemeProvider>
                        <StorageUnavailable detail={storage.detail} />
                    </ThemeProvider>
                </StrictMode>,
            );
            return;
        }
        createRoot(document.getElementById("root")!).render(
            <StrictMode>
                <ErrorBoundary>
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
                </ErrorBoundary>
            </StrictMode>
        );
    });

import { useLocation } from 'react-router-dom';
import { crmApi } from '@/api/localApiClient';
import { useQuery } from '@tanstack/react-query';


export default function PageNotFound() {
    const location = useLocation();
    const pageName = location.pathname.substring(1);

    const { data: authData, isFetched } = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
            try {
                const user = await crmApi.auth.me();
                return { user, isAuthenticated: true };
            } catch {
                return { user: null, isAuthenticated: false };
            }
        }
    });
    
    return (
        <div className="jf-app-shell flex min-h-screen items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="text-center space-y-6">
                    {/* 404 Error Code */}
                    <div className="space-y-2">
                        <h1 className="font-heading text-7xl font-light text-muted-foreground/35">404</h1>
                        <div className="mx-auto h-0.5 w-16 bg-border/70"></div>
                    </div>
                    
                    {/* Main Message */}
                    <div className="space-y-3">
                        <h2 className="font-heading text-2xl font-semibold text-foreground">
                            Page Not Found
                        </h2>
                        <p className="leading-relaxed text-muted-foreground">
                            The page <span className="font-medium text-foreground">"{pageName}"</span> could not be found in this application.
                        </p>
                    </div>
                    
                    {/* Admin Note */}
                    {isFetched && authData.isAuthenticated && authData.user?.role === 'admin' && (
                        <div className="jf-target-callout mt-8 p-4">
                            <div className="flex items-start space-x-3">
                                <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#efe0cf]">
                                    <div className="h-2 w-2 rounded-full bg-[#9f6132]"></div>
                                </div>
                                <div className="text-left space-y-1">
                                    <p className="text-sm font-semibold text-foreground">Admin Note</p>
                                    <p className="text-sm leading-relaxed text-muted-foreground">
                                        This route is not available in the current app. Check the URL or return to the dashboard.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Action Button */}
                    <div className="pt-6">
                        <button 
                            onClick={() => window.location.href = '/'} 
                            className="inline-flex min-h-10 items-center rounded-lg border border-border/60 bg-card/70 px-4 py-2 text-sm font-semibold text-foreground shadow-jf transition-colors duration-150 hover:bg-card focus:outline-none focus:ring-2 focus:ring-ring/35"
                        >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            Go Home
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

import React from 'react';

const UserNotRegisteredError = () => {
  return (
    <div className="jf-app-shell flex min-h-screen flex-col items-center justify-center px-4">
      <div className="jf-reference-panel w-full max-w-md p-8">
        <div className="text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#d8b48c] bg-[#efe0cf] text-[#794c2e] dark:border-[#765335] dark:bg-[#3a2a1d] dark:text-[#efcfab]">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="mb-4 font-heading text-3xl font-semibold text-foreground">Access Restricted</h1>
          <p className="mb-8 text-muted-foreground">
            You are not registered to use this application. Please contact the app administrator to request access.
          </p>
          <div className="jf-target-callout p-4 text-left text-sm text-muted-foreground">
            <p>If you believe this is an error, you can:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Verify you are logged in with the correct account</li>
              <li>Contact the app administrator for access</li>
              <li>Try logging out and back in again</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;

import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Card className="jf-help-banner p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#efe0cf] text-[#794c2e] dark:bg-[#3a2a1d] dark:text-[#efcfab]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-foreground">Access denied</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                You&apos;re signed in, but this area is restricted to CRM administrators.
              </p>
            </div>
            <Button type="button" onClick={() => navigate("/", { replace: true })}>
              Back to dashboard
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

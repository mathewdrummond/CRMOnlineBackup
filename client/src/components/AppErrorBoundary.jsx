import React from "react";
import { Button } from "@/components/ui/button";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App crash boundary triggered", error, errorInfo);
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">JoinerFlow</p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">Something unexpected went wrong</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The app hit an unexpected error. Your saved data is still on the server, and a refresh usually gets you back in.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={this.handleReload}>Reload App</Button>
            <Button variant="outline" onClick={() => window.location.assign("/")}>Go Home</Button>
          </div>
        </div>
      </div>
    );
  }
}

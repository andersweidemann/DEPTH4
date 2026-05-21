"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorBanner } from "@/components/shared/ErrorBanner";

type Props = { children: ReactNode; label?: string };

type State = { error: Error | null };

/** Catches render errors in a page section so one bad child does not white-screen the shell. */
export class ClientSectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ClientSectionErrorBoundary]", this.props.label ?? "section", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorBanner
          message={this.state.error.message || "Something went wrong loading this page."}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

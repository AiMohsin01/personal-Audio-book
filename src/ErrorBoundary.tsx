import { Component, type ReactNode } from "react";
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main style={{ margin: "60px auto", maxWidth: 600, padding: 30 }}>
        <h1>Folio couldn’t open this view.</h1>
        <p>
          Your saved files remain in browser storage. Reload to retry. If a
          restored backup caused this, keep the backup and inspect its records
          before importing again.
        </p>
        <button onClick={() => location.reload()}>Reload application</button>
      </main>
    ) : (
      this.props.children
    );
  }
}

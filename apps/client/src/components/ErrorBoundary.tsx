import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#fcecbf] text-moss-950">
          <h1 className="mb-4 text-2xl font-bold">Something went wrong</h1>
          <pre className="max-w-lg rounded-xl bg-moss-900 p-4 text-sm text-red-300">
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-moss-600 px-4 py-2 text-sm text-white hover:bg-moss-500"
          >
            Reload Activity
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

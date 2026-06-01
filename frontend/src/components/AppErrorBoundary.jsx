import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Falha inesperada ao renderizar o aplicativo:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-ink-50">
        <section className="feature-card max-w-md w-full p-6 text-center">
          <h1 className="text-xl text-ink-950">Não foi possível carregar esta tela</h1>
          <p className="mt-2 text-sm text-ink-600">
            O aplicativo encontrou um erro inesperado. Recarregue para tentar novamente.
          </p>
          <button type="button" onClick={this.handleReload} className="btn-accent mt-5 w-full">
            Recarregar aplicativo
          </button>
        </section>
      </main>
    );
  }
}

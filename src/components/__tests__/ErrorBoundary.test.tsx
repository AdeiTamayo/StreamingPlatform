import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { lazy, Suspense, useState } from 'react';
import ErrorBoundary from '../ErrorBoundary';

function ChunkFailed() {
  return Promise.reject(new Error('chunk load failed'));
}

describe('ErrorBoundary retry', () => {
  it('re-trips immediately when the same memoized lazy component is retried', async () => {
    const Page = lazy(ChunkFailed);
    render(
      <ErrorBoundary>
        <Suspense fallback={<div>Loading...</div>}>
          <Page />
        </Suspense>
      </ErrorBoundary>,
    );

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Try Again'));

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  it('recovers when onRetry swaps in a fresh lazy component', async () => {
    let attempt = 0;
    function factory() {
      attempt += 1;
      return attempt === 1
        ? ChunkFailed()
        : Promise.resolve({ default: () => <div>page content</div> });
    }

    function Harness() {
      const [Page, setPage] = useState(() => lazy(factory));
      return (
        <ErrorBoundary onRetry={() => setPage(() => lazy(factory))}>
          <Suspense fallback={<div>Loading...</div>}>
            <Page />
          </Suspense>
        </ErrorBoundary>
      );
    }

    render(<Harness />);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Try Again'));

    expect(await screen.findByText('page content')).toBeInTheDocument();
  });

  it('still resets on resetKey change', () => {
    function Boom({ fail }: { fail: boolean }) {
      if (fail) throw new Error('boom');
      return <div>recovered content</div>;
    }

    function Harness({ fail, resetKey }: { fail: boolean; resetKey: string }) {
      return (
        <ErrorBoundary resetKey={resetKey}>
          <Boom fail={fail} />
        </ErrorBoundary>
      );
    }

    const { rerender } = render(<Harness fail resetKey="a" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    rerender(<Harness fail={false} resetKey="b" />);

    expect(screen.getByText('recovered content')).toBeInTheDocument();
  });
});

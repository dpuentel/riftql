import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/App';

describe('RiftQL smoke test', () => {
  it('renders bootstrap shell', () => {
    render(<App />);
    expect(screen.getByText('RiftQL Bootstrapped')).toBeInTheDocument();
  });
});

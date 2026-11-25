import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/App';

describe('RiftQL smoke test', () => {
  it('renders bootstrap shell with RiftQL brand', () => {
    render(<App />);
    expect(screen.getByText('RiftQL')).toBeInTheDocument();
  });
});

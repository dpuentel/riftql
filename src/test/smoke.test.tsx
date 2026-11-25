import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/App';

describe('RiftQL smoke test', () => {
  it('renders RiftQL workspace shell', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('RiftQL')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Request URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace sidebar')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildSchema } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { SchemaDocsPanel } from '@/components/graphql/SchemaDocsPanel';
import { TooltipProvider } from '@/components/ui/tooltip';

describe('SchemaDocsPanel', () => {
  const schema = buildSchema(`
    enum Status {
      ACTIVE
      ARCHIVED
    }
    type Account {
      id: ID!
      email: String!
      status: Status!
    }
    type Query {
      account(id: ID!): Account
      health: Boolean!
    }
  `);

  it('browses root types, drills into fields/types, and navigates breadcrumbs', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <TooltipProvider>
        <SchemaDocsPanel schema={schema} onClose={onClose} />
      </TooltipProvider>,
    );

    expect(screen.getByText('Root')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /query Query/i }));

    expect(screen.getByText('account')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Account' }));

    expect(screen.getByText('email')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Root' }));
    expect(screen.getByText('All Types (6)')).toBeInTheDocument();
  });

  it('filters types and fields via search input', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SchemaDocsPanel schema={schema} />
      </TooltipProvider>,
    );

    await user.type(screen.getByLabelText('Search schema'), 'email');
    expect(screen.getByText(/Account\./)).toBeInTheDocument();
  });
});

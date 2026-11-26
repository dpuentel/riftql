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
    type Mutation {
      archiveAccount(id: ID!): Account!
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
    expect(screen.getByText('All Types (7)')).toBeInTheDocument();
  });

  it('filters types and fields via search input and allows adding root operations to editor', async () => {
    const user = userEvent.setup();
    const onInsertOperation = vi.fn();

    render(
      <TooltipProvider>
        <SchemaDocsPanel schema={schema} onInsertOperation={onInsertOperation} />
      </TooltipProvider>,
    );

    await user.type(screen.getByLabelText('Search schema'), 'account');
    expect(screen.getByRole('button', { name: 'Add account to editor' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add archiveAccount to editor' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add archiveAccount to editor' }));
    expect(onInsertOperation).toHaveBeenCalledWith('mutation', 'archiveAccount');

    // Clear search and browse into Query -> account, then Account (non-root type has no Add button)
    await user.clear(screen.getByLabelText('Search schema'));
    await user.click(screen.getByRole('button', { name: /query Query/i }));
    await user.click(screen.getByRole('button', { name: 'Add health to editor' }));
    expect(onInsertOperation).toHaveBeenCalledWith('query', 'health');

    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.queryByRole('button', { name: /to editor/i })).not.toBeInTheDocument();
  });
});

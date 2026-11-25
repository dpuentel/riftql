import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TabBar } from '@/components/layout/TabBar';
import { RequestPane } from '@/components/request/RequestPane';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createEmptyDraft, useTabsStore } from '@/store/useTabsStore';

describe('RequestPane and TabBar', () => {
  beforeEach(() => {
    useTabsStore.setState({
      tabs: [
        {
          id: 'tab-1',
          title: 'Untitled Request',
          isDirty: false,
          draft: createEmptyDraft('rest'),
          isLoading: false,
        },
      ],
      activeTabId: 'tab-1',
    });
  });

  it('syncs URL query parameters and supports switching to Body and Auth tabs', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <TabBar />
        <RequestPane />
      </TooltipProvider>,
    );

    const urlInput = screen.getByLabelText('Request URL');
    await user.type(urlInput, 'https://api.test/users?page=2');

    const tabState = useTabsStore.getState().tabs[0];
    expect(tabState.draft.params).toHaveLength(1);
    expect(tabState.draft.params[0]).toMatchObject({ key: 'page', value: '2', enabled: true });

    await user.click(screen.getByRole('tab', { name: /body/i }));
    expect(screen.getByText(/this request does not have a body/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /auth/i }));
    expect(screen.getByText(/authorization type/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /new request tab/i }));
    expect(useTabsStore.getState().tabs).toHaveLength(2);
  });

  it('renders GraphQLEditor with cm6-graphql and operation selector when protocol is graphql', () => {
    useTabsStore.setState({
      tabs: [
        {
          id: 'tab-gql',
          title: 'GQL',
          isDirty: false,
          draft: {
            ...createEmptyDraft('graphql'),
            url: 'https://api.test/graphql',
            graphql: {
              query: 'query GetMe { me { id } }\nmutation UpdateMe { updateMe { id } }',
              variables: '{}',
            },
          },
          isLoading: false,
        },
      ],
      activeTabId: 'tab-gql',
    });

    render(
      <TooltipProvider>
        <RequestPane />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: /fetch schema/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /docs/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Operation')).toBeInTheDocument();
  });
});

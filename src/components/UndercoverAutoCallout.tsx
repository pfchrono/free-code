import React, { useEffect } from 'react';
import { Box, Text } from '../ink.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import { PermissionDialog } from './permissions/PermissionDialog.js';

type Props = {
  onDone: () => void;
};

export function UndercoverAutoCallout({ onDone }: Props): React.ReactNode {
  useEffect(() => {
    // Mark as seen when the callout is first rendered
    saveGlobalConfig(current => {
      if (current.hasSeenUndercoverAutoNotice) return current;
      return { ...current, hasSeenUndercoverAutoNotice: true };
    });
  }, []);

  return (
    <PermissionDialog title="Undercover Mode Auto-Enabled">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text>
            This repository has been classified for internal model access. Undercover mode has been automatically enabled to route your requests appropriately.
          </Text>
        </Box>
        <Box>
          <Text dimColor>
            You can disable Undercover mode anytime via /settings or the CLAUDE_CODE_UNDERCOVER environment variable.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            Press Enter or Esc to dismiss.
          </Text>
        </Box>
      </Box>
    </PermissionDialog>
  );
}

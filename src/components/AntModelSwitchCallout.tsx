import React, { useEffect } from 'react';
import { Box, Text } from '../ink.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import { getAntModelOverrideConfig } from '../utils/model/antModels.js';
import { PermissionDialog } from './permissions/PermissionDialog.js';
import type { AntModelSwitchCalloutConfig } from '../utils/model/antModels.js';

type Props = {
  onDone: (selection: string, modelAlias?: string) => void;
};

export function AntModelSwitchCallout({ onDone }: Props): React.ReactNode {
  useEffect(() => {
    saveGlobalConfig(current => {
      if (current.hasSeenAntModelSwitchCallout) return current;
      return { ...current, hasSeenAntModelSwitchCallout: true };
    });
  }, []);

  if (process?.env?.USER_TYPE !== 'ant') {
    return null;
  }

  const calloutConfig: AntModelSwitchCalloutConfig | null =
    getAntModelOverrideConfig()?.switchCallout ?? null;

  if (!calloutConfig) {
    return null;
  }

  const handleSwitch = () => {
    onDone('switch', calloutConfig.modelAlias);
  };

  const handleDismiss = () => {
    onDone('dismiss');
  };

  return (
    <PermissionDialog
      title="Model Update Available"
      onConfirm={handleSwitch}
      confirmLabel="Switch"
      onCancel={handleDismiss}
      cancelLabel="Dismiss"
    >
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text>{calloutConfig.description}</Text>
        </Box>
        <Box>
          <Text dimColor>Version: {calloutConfig.version}</Text>
        </Box>
      </Box>
    </PermissionDialog>
  );
}

export function shouldShowModelSwitchCallout(): AntModelSwitchCalloutConfig | null {
  if (process?.env?.USER_TYPE !== 'ant') {
    return null;
  }
  const config = getGlobalConfig();
  if (config.hasSeenAntModelSwitchCallout) {
    return null;
  }
  return getAntModelOverrideConfig()?.switchCallout ?? null;
}

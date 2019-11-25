import React, { useState } from 'react';
import { withRouter, RouteComponentProps } from 'react-router-dom';

import { translateRaw } from 'v2/translations';
import { ExtendedContentPanel } from 'v2/components';
import { ROUTE_PATHS } from 'v2/config';
import { useStateReducer } from 'v2/utils';
import { ITxReceipt, ISignedTx } from 'v2/types';

import { interactWithContractsInitialState, InteractWithContractsFactory } from './stateFactory';
import { Interact, InteractionReceipt } from './components';
import { ABIItem, InteractWithContractState } from './types';
import { WALLET_STEPS } from './helpers';
import InteractionConfirm from './components/InteractionConfirm';

interface TStep {
  title: string;
  component: any;
  props: any;
  actions: any;
}

const InteractWithContractsFlow = (props: RouteComponentProps<{}>) => {
  const [step, setStep] = useState(0);
  const {
    interactWithContractsState,
    handleNetworkSelected,
    handleContractSelected,
    handleContractAddressChanged,
    handleAbiChanged,
    updateNetworkContractOptions,
    setGeneratedFormVisible,
    handleInteractionFormSubmit,
    handleInteractionFormWriteSubmit,
    handleAccountSelected,
    handleTxSigned,
    estimateGas,
    handleGasSelectorChange
  } = useStateReducer(InteractWithContractsFactory, interactWithContractsInitialState);
  const { account }: InteractWithContractState = interactWithContractsState;

  const goToFirstStep = () => {
    setStep(0);
  };

  const goToNextStep = () => {
    setStep(step + 1);
  };

  const goToPreviousStep = () => {
    const { history } = props;
    if (step === 0) {
      history.push(ROUTE_PATHS.DASHBOARD.path);
    } else {
      setStep(step - 1);
    }
  };

  const steps: TStep[] = [
    {
      title: translateRaw('Interact with Contracts'),
      component: Interact,
      props: (({
        networkId,
        contractAddress,
        contract,
        abi,
        contracts,
        showGeneratedForm,
        rawTransaction
      }) => ({
        networkId,
        contractAddress,
        contract,
        abi,
        contracts,
        showGeneratedForm,
        account,
        rawTransaction
      }))(interactWithContractsState),
      actions: {
        handleNetworkSelected,
        handleContractSelected,
        handleContractAddressChanged,
        handleAbiChanged,
        updateNetworkContractOptions,
        setGeneratedFormVisible,
        handleInteractionFormSubmit,
        handleInteractionFormWriteSubmit: (payload: ABIItem) =>
          handleInteractionFormWriteSubmit(payload, goToNextStep),
        handleAccountSelected,
        estimateGas,
        handleGasSelectorChange
      }
    },
    {
      title: 'Confirm Transaction',
      component: InteractionConfirm,
      props: (({ txConfig }) => ({ txConfig }))(interactWithContractsState),
      actions: { goToNextStep }
    },
    {
      title: 'Sign write transaction',
      component: account && WALLET_STEPS[account.wallet],
      props: (({ rawTransaction }) => ({
        network: account && account.network,
        senderAccount: account,
        rawTransaction
      }))(interactWithContractsState),
      actions: {
        onSuccess: (payload: ITxReceipt | ISignedTx) => handleTxSigned(payload, goToNextStep)
      }
    },
    {
      title: translateRaw('Interaction Receipt'),
      component: InteractionReceipt,
      props: (({ txConfig, txReceipt }) => ({ txConfig, txReceipt }))(interactWithContractsState),
      actions: { goToFirstStep }
    }
  ];

  const stepObject = steps[step];
  const StepComponent = stepObject.component;
  const stepProps = stepObject.props;
  const stepActions = stepObject.actions;

  return (
    <ExtendedContentPanel
      onBack={goToPreviousStep}
      stepper={{ current: step + 1, total: steps.length }}
      width="750px"
      heading={stepObject.title}
    >
      <StepComponent goToNextStep={goToNextStep} {...stepProps} {...stepActions} />
    </ExtendedContentPanel>
  );
};

export default withRouter(InteractWithContractsFlow);

import { useContext, useRef } from 'react';
import { debounce } from 'lodash';

import { TUseStateReducerFactory, generateUUID, fromTxReceiptObj } from 'v2/utils';
import { DEFAULT_NETWORK } from 'v2/config';
import { Contract, StoreAccount } from 'v2/types';
import {
  getNetworkById,
  ContractContext,
  isValidETHAddress,
  ProviderHandler,
  getGasEstimate,
  updateNetworks,
  deleteContracts,
  getResolvedENSAddress,
  EtherscanService
} from 'v2/services';
import { AbiFunction } from 'v2/services/EthService/contracts/ABIFunction';
import { isWeb3Wallet } from 'v2/utils/web3';
import { translateRaw } from 'v2/translations';

import { customContract, CUSTOM_CONTRACT_ADDRESS } from './constants';
import { ABIItem, InteractWithContractState } from './types';
import {
  makeTxConfigFromTransaction,
  reduceInputParams,
  constructGasCallProps,
  isValidETHDomain
} from './helpers';

const interactWithContractsInitialState = {
  networkId: DEFAULT_NETWORK,
  addressOrDomainInput: '',
  resolvingDomain: false,
  contractAddress: '',
  contract: undefined,
  customContractName: '',
  contracts: [],
  abi: '',
  showGeneratedForm: false,
  submitedFunction: undefined,
  data: undefined,
  account: undefined,
  rawTransaction: {
    gasPrice: '0xee6b2800',
    gasLimit: 21000,
    nonce: 0
  },
  txConfig: undefined,
  txReceipt: undefined
};

const InteractWithContractsFactory: TUseStateReducerFactory<InteractWithContractState> = ({
  state,
  setState
}) => {
  const { getContractsByIds, createContractWithId } = useContext(ContractContext);

  const handleNetworkSelected = (networkId: any) => {
    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      networkId,
      contract: undefined,
      contractAddress: '',
      addressOrDomainInput: '',
      abi: '',
      customContractName: '',
      resolvingDomain: false
    }));
  };

  const updateNetworkContractOptions = (networkId: any) => {
    // Get contracts for selected network
    const contractIds = getNetworkById(networkId)!.contracts;
    const networkContracts = getContractsByIds(contractIds);

    const customContractOption = Object.assign(customContract, { networkId });

    const contracts = [customContractOption, ...networkContracts].map(x =>
      Object.assign(x, { label: x.name })
    );

    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      contracts
    }));
  };

  const handleContractSelected = (contract: Contract) => {
    let contractAddress = '';
    let addressOrDomainInput = '';
    let contractAbi = '';

    if (contract.address !== CUSTOM_CONTRACT_ADDRESS) {
      contractAddress = contract.address;
      addressOrDomainInput = contract.address;
      contractAbi = contract.abi;
    }

    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      contract,
      contractAddress,
      addressOrDomainInput,
      abi: contractAbi,
      customContractName: '',
      resolvingDomain: false
    }));
  };

  const debouncedResolveAddressFromDomain = useRef(
    debounce((value: string) => resolveAddressFromDomain(value), 1500)
  );
  const handleAddressOrDomainChanged = (value: string) => {
    if (checkForExistingContract(value)) {
      return;
    }

    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      addressOrDomainInput: value,
      contractAddress: value,
      contract: customContract,
      abi: ''
    }));

    if (isValidETHDomain(value)) {
      debouncedResolveAddressFromDomain.current(value);
    }

    if (isValidETHAddress(value)) {
      fetchABI(value);
    }
  };

  const resolveAddressFromDomain = async (domain: string) => {
    const network = getNetworkById(state.networkId)!;

    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      resolvingDomain: true
    }));

    const resolvedAddress =
      (await getResolvedENSAddress(network, domain)) ||
      '0x0000000000000000000000000000000000000000';

    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      contractAddress: resolvedAddress,
      resolvingDomain: false
    }));

    if (!checkForExistingContract(resolvedAddress)) {
      fetchABI(resolvedAddress);
    }
  };

  const checkForExistingContract = (address: string) => {
    const existingContract = state.contracts.find(c => c.address === address);
    if (existingContract) {
      handleContractSelected(existingContract);
      return true;
    }
    return false;
  };

  const fetchABI = async (address: string) => {
    const fetchedAbi = await EtherscanService.instance.getContractAbi(address, state.networkId);
    if (fetchedAbi) {
      setState((prevState: InteractWithContractState) => ({
        ...prevState,
        abi: fetchedAbi
      }));
    }
  };

  const handleAbiChanged = (abi: string) => {
    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      abi
    }));
  };

  const handleCustomContractNameChanged = (customContractName: string) => {
    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      customContractName
    }));
  };

  const handleSaveContractSubmit = () => {
    const uuid = generateUUID();

    if (!state.contractAddress || !state.customContractName || !state.abi) {
      throw new Error(translateRaw('INTERACT_WRITE_ERROR_MISSING_DATA'));
    }

    if (!isValidETHAddress(state.contractAddress)) {
      throw new Error(translateRaw('INTERACT_ERROR_INVALID_ADDRESS'));
    }

    try {
      JSON.parse(state.abi);
    } catch (e) {
      throw new Error(`ABI Error: ${e.message}`);
    }

    if (state.contracts.find(item => item.name === state.customContractName)) {
      throw new Error(translateRaw('INTERACT_SAVE_ERROR_NAME_EXISTS'));
    }

    const newContract = {
      abi: state.abi,
      address: state.contractAddress,
      name: state.customContractName,
      label: state.customContractName,
      networkId: state.networkId,
      isCustom: true,
      uuid
    };

    createContractWithId(newContract, uuid);
    const network = getNetworkById(state.networkId)!;
    network.contracts.unshift(uuid);
    updateNetworks(state.networkId, network);
    updateNetworkContractOptions(state.networkId);
    handleContractSelected(newContract);
  };

  const handleDeleteContract = (contractUuid: string) => {
    deleteContracts(contractUuid);
    const network = getNetworkById(state.networkId)!;
    network.contracts = network.contracts.filter(item => item !== contractUuid);
    updateNetworks(state.networkId, network);
    updateNetworkContractOptions(state.networkId);
    handleContractSelected(customContract);
  };

  const setGeneratedFormVisible = (visible: boolean) => {
    if (visible) {
      if (!state.contractAddress || !state.abi) {
        throw new Error(translateRaw('INTERACT_ERROR_NO_CONTRACT_SELECTED'));
      }

      if (!isValidETHAddress(state.contractAddress)) {
        throw new Error(translateRaw('INTERACT_ERROR_INVALID_ADDRESS'));
      }

      try {
        JSON.parse(state.abi);
      } catch (e) {
        throw new Error(`ABI Error: ${e.message}`);
      }
    }

    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      showGeneratedForm: visible
    }));
  };

  const handleInteractionFormSubmit = async (submitedFunction: ABIItem) => {
    const { networkId, contractAddress } = state;
    const { encodeInput, decodeOutput } = new AbiFunction(submitedFunction, []);
    const parsedInputs = reduceInputParams(submitedFunction);
    const network = getNetworkById(networkId)!;
    const providerHandler = new ProviderHandler(network);
    const data = { to: contractAddress, data: encodeInput(parsedInputs) };

    const result = await providerHandler.call(data);

    return decodeOutput(result, network.chainId);
  };

  const handleInteractionFormWriteSubmit = async (submitedFunction: ABIItem, after: () => void) => {
    const { contractAddress, account, rawTransaction } = state;

    if (!account) {
      throw new Error(translateRaw('INTERACT_WRITE_ERROR_NO_ACCOUNT'));
    }

    try {
      const { network } = account;
      const { gasPrice, gasLimit, nonce } = rawTransaction;
      const transaction: any = Object.assign(
        constructGasCallProps(contractAddress, submitedFunction, account),
        {
          gasPrice,
          chainId: network.chainId,
          nonce
        }
      );
      // check if transaction fails everytime
      await getGasEstimate(network, transaction);
      transaction.gasLimit = gasLimit;
      delete transaction.from;

      const txConfig = makeTxConfigFromTransaction(
        transaction,
        account,
        submitedFunction.payAmount
      );

      setState((prevState: InteractWithContractState) => ({
        ...prevState,
        rawTransaction: transaction,
        txConfig
      }));

      after();
    } catch (e) {
      throw e;
    }
  };

  const handleAccountSelected = (account: StoreAccount | undefined) => {
    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      account
    }));
  };

  const handleTxSigned = async (signResponse: any, after: () => void) => {
    const { account, txConfig } = state;

    if (!account) {
      return;
    }

    if (isWeb3Wallet(account.wallet)) {
      const txReceipt =
        signResponse && signResponse.hash
          ? signResponse
          : { hash: signResponse, asset: txConfig.asset };
      setState((prevState: InteractWithContractState) => ({
        ...prevState,
        txReceipt
      }));

      after();
    } else {
      const provider = new ProviderHandler(account.network);
      provider
        .sendRawTx(signResponse)
        .then(retrievedTxReceipt => retrievedTxReceipt)
        .catch(hash => provider.getTransactionByHash(hash))
        .then(retrievedTransactionReceipt => {
          const txReceipt = fromTxReceiptObj(retrievedTransactionReceipt);
          setState((prevState: InteractWithContractState) => ({
            ...prevState,
            txReceipt
          }));
        })
        .finally(after);
    }
  };

  const handleGasSelectorChange = (payload: any) => {
    setState((prevState: InteractWithContractState) => ({
      ...prevState,
      rawTransaction: { ...prevState.rawTransaction, ...payload }
    }));
  };

  return {
    handleNetworkSelected,
    handleAddressOrDomainChanged,
    handleContractSelected,
    handleAbiChanged,
    handleCustomContractNameChanged,
    handleSaveContractSubmit,
    updateNetworkContractOptions,
    setGeneratedFormVisible,
    handleInteractionFormSubmit,
    handleInteractionFormWriteSubmit,
    handleAccountSelected,
    handleTxSigned,
    handleGasSelectorChange,
    handleDeleteContract,
    interactWithContractsState: state
  };
};

export { interactWithContractsInitialState, InteractWithContractsFactory };

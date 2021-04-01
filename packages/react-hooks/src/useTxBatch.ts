// Copyright 2017-2020 @polkadot/react-hooks authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiPromise } from '@polkadot/api';
import type { SubmittableExtrinsic } from '@polkadot/api/types';

import { useEffect, useMemo, useState } from 'react';

import { isFunction } from '@polkadot/util';

import { useAccounts } from './useAccounts';
import { useApi } from './useApi';

interface Options {
  batchSize?: number;
  isBatchAll?: boolean;
}

function createBatches (api: ApiPromise, txs: SubmittableExtrinsic<'promise'>[], batchSize: number, isBatchAll = false): SubmittableExtrinsic<'promise'>[] {
  if (batchSize === 1 || !isFunction(api.tx.utility?.batch)) {
    return txs;
  }

  return txs
    .reduce((batches: SubmittableExtrinsic<'promise'>[][], tx): SubmittableExtrinsic<'promise'>[][] => {
      const batch = batches[batches.length - 1];

      if (batch.length >= batchSize) {
        batches.push([tx]);
      } else {
        batch.push(tx);
      }

      return batches;
    }, [[]])
    .reduce((extrinsics: SubmittableExtrinsic<'promise'>[], batch): SubmittableExtrinsic<'promise'>[] => {
      if (batch.length === 1) {
        extrinsics.push(batch[0]);
      } else {
        extrinsics.push(
          isBatchAll && isFunction(api.tx.utility.batchAll)
            ? api.tx.utility.batchAll(batch)
            : api.tx.utility.batch(batch)
        );
      }

      return extrinsics;
    }, []);
}

export function useTxBatch (txs?: SubmittableExtrinsic<'promise'>[] | null, options: Options = {}): SubmittableExtrinsic<'promise'>[] | null {
  const { api } = useApi();
  const { allAccounts } = useAccounts();
  const [batchSize, setBatchSize] = useState(Math.floor(options.batchSize || 64));

  useEffect((): void => {
    txs && txs.length &&
      txs[0]
        .paymentInfo(allAccounts[0])
        .then((info) => setBatchSize((prev) =>
          info.weight.isZero()
            ? prev
            : Math.floor(
              api.consts.system.blockWeights.maxBlock
                .muln(64) // 65% of the block weight on a single extrinsic (64 for safety)
                .div(info.weight)
                .toNumber() / 100
            )
        ))
        .catch(console.error);
  }, [allAccounts, api, options, txs]);

  return useMemo(
    () => txs && txs.length
      ? createBatches(api, txs, batchSize, options.isBatchAll)
      : null,
    [api, batchSize, options, txs]
  );
}

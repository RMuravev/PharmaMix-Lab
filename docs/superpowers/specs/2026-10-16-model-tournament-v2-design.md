# Model Tournament v2 design

## Purpose

Model Tournament v2 selects among genuinely supported predictive MMM families using leakage-safe temporal evidence. It answers whether an eligible model materially and consistently improves on a baseline; it may return `no-clear-winner`. Predictive superiority is never presented as causal identification or incrementality.

## Legacy audit

The retained classic page fabricates 42 specifications, metrics, parameters, p-values, ROAS, and a winner across families the current product does not implement. A separate legacy AutoML path compares seasonal naive, OLS, and a custom TCN on one held-out horizon. The useful concepts are a baseline, common observations, visible progress, fold details, and champion explanation. Fabricated rows, one-split ranking, causal language, and unsupported families are discarded. No legacy module may enter the current graph.

## Supported candidates

- `seasonal-naive`: non-learned baseline using the previous available seasonal lag, falling back to the latest train observation.
- `ols`: current linear MMM kernel.
- `ridge`: L2 regularization with lambda selected inside each outer training fold.
- `lasso`: deterministic coordinate descent, train-fold scaling and inner temporal lambda selection.
- `elastic-net`: deterministic coordinate descent with explicit L1 ratio and inner temporal lambda selection.

This workflow currently uses raw contemporaneous TV, weighted visits and accrued promo bonus with zero lags. It does not apply or jointly tune adstock/Hill transformations. The retained neural/TCN implementation is deferred because it belongs to the retired graph and lacks the current reproducibility, worker, and provenance contract.

## Evaluation and recommendation

Expanding monthly folds train strictly before their test window. Scaling, regularization, and hyperparameter selection use only outer-train observations. Every candidate reports RMSE, MAE, normalized RMSE, valid OOS R², baseline skill, and fold dispersion. Candidate comparisons require the exact same period/panel keys, average paired squared-loss differences within each calendar month, and use a lag-1 HAC standard error across months. Fewer than eight consecutive OOS months, gaps, or mismatched support remain inconclusive. Duplicating or reordering panels cannot increase temporal support.

Validity is separate from predictive rank. Non-finite outputs, failed fits, implausible marketing signs, and inadequate support block eligibility. Coefficient ranges, fold dispersion, interpretability, and complexity are exposed separately from predictive rank. An eligible leader becomes champion only with positive baseline skill, at least three folds, a practical improvement of at least 2%, and paired evidence whose 95% interval excludes zero. Otherwise the outcome is tied contenders or `no-clear-winner`. VIF, residual structure, contribution stability and train/OOS degradation remain available on the dedicated MMM diagnostics workflow; combining them into the tournament gate is deferred until their candidate-specific estimands can be computed consistently for every family.

## Architecture and lifecycle

Pure domain/application services own folds, metrics, candidates, validity, comparisons, and recommendation. A dedicated current worker runs the tournament off the UI thread and emits progress. The page captures project/dataset identity before launch and ignores results after cancellation, project change, unmount, or active-version change. Persistence uses the current atomic model-run stores and records project, dataset version, brand/scope, feature definition, candidate configuration, algorithm/schema version, timestamp, fold evidence, diagnostics, and explanation.

The UI provides configuration, loading/cancellation, per-candidate failures, RMSE-sorted predictive evidence, eligibility/status, champion/challenger loss deltas, fold drill-down, provenance, and explicit observational limitations.

## Performance and limitations

Worker execution is sequential and deterministic with bounded grids; correctness and cancellation take priority over parallelism. Temporal folds are not independent experiments, HAC support is approximate with few months, and a predictive winner is not a causal model. Log predictions are exponentiated without a retransformation correction and are not claimed as unbiased conditional-mean RUB forecasts. Region-specific stability requires sufficient panels and is reported as unavailable when support is absent.

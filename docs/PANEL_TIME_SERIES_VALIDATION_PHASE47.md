# Panel time-series validation — phase 47

## What changed

Added `validatePanelTimeSeries` and focused tests. The service splits observations by a stable group key and invokes the monthly validator independently for each group. A month present in one brand/region cannot mask a missing month in another series. Expected holdout periods are checked within every group.

## Integration boundary

This service is intentionally not silently wired into the existing OOS screen: the current `VAL.preds` presentation path aggregates observations by month and does not reliably expose a canonical panel key for every model result. Inferring brand/region keys would risk changing model metrics. The next integration step must carry an explicit stable series key from the validation executor through the prediction rows and then call this service before calculating comparison metrics.

## Interpretation

- A missing month is not automatically zero sales.
- Every panel unit should be validated separately before HAC/Newey–West inference.
- Group-level validation is a data-quality gate, not a panel regression estimator and not evidence of causal effects.
- Test/build status is not asserted unless dependencies are installed and commands are run.

.PHONY: prepare check test build update examples clean

prepare:
	pnpm run format
	pnpm exec tsc --noEmit
	pnpm exec tsc --ignoreConfig --noEmit examples/*.ts

check:
	pnpm exec prettier --check .
	pnpm exec tsc --noEmit
	pnpm exec tsc --ignoreConfig --noEmit examples/*.ts
	pnpm run test-cov
	make build

test:
	pnpm test

build:
	pnpm run build

update:
	pnpm self-update 11
	pnpm update npm-check-updates --latest
	pnpm exec npm-check-updates --reject typescript --upgrade && pnpm i

examples:
	pnpm exec tsx scripts/make-examples.ts
	$(MAKE) prepare

clean:
	docker images --format "{{.Repository}}:{{.Tag}}" | grep "^apigen_ts" | xargs -r docker rmi --force

.PHONY: test-matrix
TS_VERSIONS := 5.0 5.1 5.2 5.3 5.4 5.5 5.6 5.7 5.8 5.9 6.0

build-ts-%:
	@echo "-- build $* --------------------"
	@docker -l warning build -f Dockerfile.test --build-arg TS_VER=$* -t apigen_ts$* .

run-ts-%:
	@echo "-- run $* --------------------"
	@docker run apigen_ts$*

test-matrix:
	@$(MAKE) -j$(words $(TS_VERSIONS)) $(addprefix build-ts-,$(TS_VERSIONS))
	@$(MAKE) $(addprefix run-ts-,$(TS_VERSIONS))

.PHONY: guru-generate guru-check

guru-generate:
	pnpm exec tsx scripts/guru-check.ts

guru-check:
	find ./generated/guru/clients/local -name '*.ts' -print0 | env NODE_OPTIONS="--max-old-space-size=4096" xargs -0 -n 100 ./node_modules/.bin/tsc --noEmit --ignoreConfig

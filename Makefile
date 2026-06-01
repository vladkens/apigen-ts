.PHONY: prepare check test build update test-matrix clean

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
	pnpm exec npm-check-updates -u && pnpm i

TS_VERSIONS := 5.0.4 5.1.6 5.2.2 5.3.3 5.4.5 5.5.4 5.6.3 5.7.3 5.8.3 5.9.2 6.0.3 next

build-ts-%:
	@echo "-- build $* --------------------"
	@docker -l warning build -f Dockerfile.test --build-arg TS_VER=$* -t apigen_ts$* .

run-ts-%:
	@echo "-- run $* --------------------"
	@docker run apigen_ts$*

test-matrix:
	@$(MAKE) -j$(words $(TS_VERSIONS)) $(addprefix build-ts-,$(TS_VERSIONS))
	@$(MAKE) $(addprefix run-ts-,$(TS_VERSIONS))

clean:
	docker images --format "{{.Repository}}:{{.Tag}}" | grep "^apigen_ts" | xargs -r docker rmi --force

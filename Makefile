.PHONY: test test-ts test-matrix-ts clean update

default: fmt
	npm run ci
	npx tsx scripts/make-examples.ts

fmt:
	npm run format

test:
	npm test

update:
	npx --yes npm-check-updates -u
	npm install

TS_VERSIONS := 5.0.4 5.1.6 5.2.2 5.3.3 5.4.5 5.5.4 5.6.3 5.7.3 5.8.3 5.9.2 next

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

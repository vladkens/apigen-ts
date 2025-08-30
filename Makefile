.PHONY: test test-ts test-matrix-ts clean

default:
	yarn ci

test:
	yarn test

test-ts:
	@echo "-- $(v) --------------------"
	$(eval name=apigen_ts$(v))
	@docker -l warning build -f Dockerfile.test --build-arg TS_VER=$(v) -t $(name) .
	@docker run $(name)

test-matrix-ts:
	@make test-ts v=5.0.4
	@make test-ts v=5.1.6
	@make test-ts v=5.2.2
	@make test-ts v=5.3.3
	@make test-ts v=5.4.5
	@make test-ts v=5.5.4
	@make test-ts v=5.6.3
	@make test-ts v=5.7.3
	@make test-ts v=5.8.3
	@make test-ts v=5.9.2
	@make test-ts v=next

clean:
	docker images --format "{{.Repository}}:{{.Tag}}" | grep "^apigen_ts" | xargs -r docker rmi --force

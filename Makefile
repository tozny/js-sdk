# Import environment file
include .env
# Source all variables in environment file
# This only runs in the make command shell
# so won't muddy up, e.g. your login shell
export $(shell sed 's/=.*//' .env)

build-test-image:
	docker build . -f DockerfileForUnitTesting -t registry.tozny.com/tozny/tozny-test/jssdk-test:local

publish-test-image: build-test-image
	# Build image with latest and matching forensic tag (SHA's for the images will be the same) for remote users
	docker tag registry.tozny.com/tozny/tozny-test/jssdk-test:local registry.tozny.com/tozny/tozny-test/jssdk-test:$(TEST_IMAGE_TAG)
	docker push registry.tozny.com/tozny/tozny-test/jssdk-test:$(TEST_IMAGE_TAG)
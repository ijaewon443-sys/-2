# Local deployment and measurement

The Windows runner publishes the SHA-tagged image and keeps nginx bound to 127.0.0.1:8080. New backends are started and checked before nginx reloads its upstream. The previous backend is retained for recovery. The initial migration from the old direct container binding requires releasing and rebinding port 8080; it cannot be called uninterrupted.

The deployment workflow runs repeated browser inferences on a fixed MNIST test image, reloading the application for every attempt. Its Summary reports successes, failures, observed versions, and the largest interval between attempt starts. Sampling cannot prove availability between attempts; a connection failure or wrong inference makes the job fail. The detailed attempt log is uploaded as an artifact.

The first migration run, 42634147515, observed one connection refusal during the port handoff, with 4/4 successful before, 5/6 during, and 4/4 after. The largest measured interval between attempt starts was 4.02 seconds. This is not an outage duration measurement.

#!/usr/bin/env python3
import os
import sys
assert(len(sys.argv) == 2)
if True:
    os.system("sbatch " + sys.argv[1])
os.system("squeue -p gpua100")

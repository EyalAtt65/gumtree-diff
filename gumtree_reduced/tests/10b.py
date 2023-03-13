"""
Docstring
"""

import logging

def main(arg1, arg2=None):
    print(arg1)
    if arg2 is not None:
        for i in range(arg2):
            logging.debug(i)
            print(arg1 * 2)
            arg1 += 5

    a = 1
    a *= 7
    b = []
    logging.info(b)

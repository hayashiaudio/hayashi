# Install script for directory: /Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/src

# Set the install prefix
if(NOT DEFINED CMAKE_INSTALL_PREFIX)
  set(CMAKE_INSTALL_PREFIX "/usr/local")
endif()
string(REGEX REPLACE "/$" "" CMAKE_INSTALL_PREFIX "${CMAKE_INSTALL_PREFIX}")

# Set the install configuration name.
if(NOT DEFINED CMAKE_INSTALL_CONFIG_NAME)
  if(BUILD_TYPE)
    string(REGEX REPLACE "^[^A-Za-z0-9_]+" ""
           CMAKE_INSTALL_CONFIG_NAME "${BUILD_TYPE}")
  else()
    set(CMAKE_INSTALL_CONFIG_NAME "")
  endif()
  message(STATUS "Install configuration: \"${CMAKE_INSTALL_CONFIG_NAME}\"")
endif()

# Set the component getting installed.
if(NOT CMAKE_INSTALL_COMPONENT)
  if(COMPONENT)
    message(STATUS "Install component: \"${COMPONENT}\"")
    set(CMAKE_INSTALL_COMPONENT "${COMPONENT}")
  else()
    set(CMAKE_INSTALL_COMPONENT)
  endif()
endif()

# Is this installation the result of a crosscompile?
if(NOT DEFINED CMAKE_CROSSCOMPILING)
  set(CMAKE_CROSSCOMPILING "FALSE")
endif()

# Set path to fallback-tool for dependency-resolution.
if(NOT DEFINED CMAKE_OBJDUMP)
  set(CMAKE_OBJDUMP "/usr/bin/objdump")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib" TYPE STATIC_LIBRARY FILES "/Users/jdbohrman/hayashi/native/optimizer/build/vendor/libcmaes/src/libcmaes.a")
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libcmaes.a" AND
     NOT IS_SYMLINK "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libcmaes.a")
    execute_process(COMMAND "/usr/bin/ranlib" "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libcmaes.a")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/libcmaes" TYPE FILE FILES
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/cmaes.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/opti_err.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/eo_matrix.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/cmastrategy.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/esoptimizer.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/esostrategy.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/cmasolutions.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/parameters.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/cmaparameters.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/cmastopcriteria.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/ipopcmastrategy.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/bipopcmastrategy.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/covarianceupdate.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/acovarianceupdate.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/vdcmaupdate.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/pwq_bound_strategy.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/eigenmvn.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/candidate.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/genopheno.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/noboundstrategy.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/scaling.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/llogging.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/errstats.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/pli.h"
    "/Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/include/libcmaes/contour.h"
    "/Users/jdbohrman/hayashi/native/optimizer/build/vendor/libcmaes/include/libcmaes/cmaes_export.h"
    )
endif()

string(REPLACE ";" "\n" CMAKE_INSTALL_MANIFEST_CONTENT
       "${CMAKE_INSTALL_MANIFEST_FILES}")
if(CMAKE_INSTALL_LOCAL_ONLY)
  file(WRITE "/Users/jdbohrman/hayashi/native/optimizer/build/vendor/libcmaes/src/install_local_manifest.txt"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
endif()

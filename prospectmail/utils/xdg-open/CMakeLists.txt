cmake_minimum_required(VERSION 3.10)
project(xdg_open-test LANGUAGES CXX)

set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Trouver les modules Qt5
find_package(Qt5 REQUIRED COMPONENTS Core Gui)

add_executable(xdg-open-test xdg-open-test.cpp)

# Lier les bibliothèques Qt nécessaires
target_link_libraries(xdg-open-test Qt5::Core Qt5::Gui)

set_target_properties(xdg-open-test PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
) 

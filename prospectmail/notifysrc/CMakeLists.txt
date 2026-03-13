cmake_minimum_required(VERSION 3.5)
project(notify C CXX)

set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Qt5 modules
find_package(Qt5 5.9 REQUIRED COMPONENTS Core Gui Qml Quick DBus)

# Sources
file(GLOB_RECURSE APP_SOURCES
    resource.qrc
    src/*.cpp
    src/*.h
)

# Executable
add_executable(${PROJECT_NAME}
    ${APP_SOURCES}  
)

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE
    Qt5::Core
    Qt5::Gui
    Qt5::Qml
    Qt5::Quick
    Qt5::DBus    
)

install(TARGETS ${PROJECT_NAME} RUNTIME DESTINATION ${CMAKE_INSTALL_PREFIX}/bin)

# Installer les fichier de lancement
install(FILES content-hub.json DESTINATION ${CMAKE_INSTALL_PREFIX})
install(FILES icon.png DESTINATION ${CMAKE_INSTALL_PREFIX})
install(FILES icon-splash.png DESTINATION ${CMAKE_INSTALL_PREFIX})
install(FILES manifest.json DESTINATION ${CMAKE_INSTALL_PREFIX})
install(FILES notify-push-helper.json DESTINATION ${CMAKE_INSTALL_PREFIX})
install(FILES notify-push.apparmor DESTINATION ${CMAKE_INSTALL_PREFIX})
install(FILES notify.apparmor DESTINATION ${CMAKE_INSTALL_PREFIX})
install(FILES notify.desktop DESTINATION ${CMAKE_INSTALL_PREFIX})
install(FILES push-apparmor.json DESTINATION ${CMAKE_INSTALL_PREFIX})
install(PROGRAMS pushexec DESTINATION ${CMAKE_INSTALL_PREFIX})




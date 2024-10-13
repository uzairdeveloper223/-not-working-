#!/bin/bash
red='\033[1;31m'
green='\033[1;32m'
yellow='\033[1;33m'
blue='\033[1;34m'
cyan='\033[1;36m'
reset='\033[0m'

banner() {
  echo -e "${cyan}"
  echo "========================================="
  echo "      Welcome to Uzair's Bash Script      "
  echo "========================================="
  echo -e "${reset}"
}
loading() {
  echo -e "${yellow}Loading...${reset}"
  for i in {1..3}; do
    echo -n "."
    sleep 0.5
  done
  echo -e "\n${green}Done!${reset}"
}

about_me() {
  clear
  banner
  echo -e "${blue}About Me:${reset}"
  echo "Hi, I’m Uzair, a developer passionate about coding, tech, and guiding others."
  sleep 2
  echo -e "\n${yellow}Select an option:${reset}"
  echo -e "1) Ways to Contact Me"
  echo -e "2) List of My Websites"
  echo -e "3) Exit"
  echo -e "\nEnter your choice: "
  read choice
  case $choice in
    1) contact_me ;;
    2) list_websites ;;
    3) exit_script ;;
    *) echo "Invalid option. Exiting..." && exit 1 ;;
  esac
}
contact_me() {
  clear
  banner
  echo -e "${green}Ways to Contact Me:${reset}"
  echo "Email: developer.uzair223@gmail.com"
  echo "Telegram: @LEGENDxUZAIR"
  sleep 5
  about_me
}

list_websites() {
  clear
  banner
  echo -e "${cyan}List of My Websites:${reset}"
  echo -e "1) https://for-myuse.infinityfreeapp.com"
  echo -e "2) https://global-chat.rf.gd"
  echo -e "3) https://info-here.rf.gd"
  echo -e "4) https://islamic-articles.rf.gd"
  echo -e "\nEnter the number of the website you want to visit: "
  read website_choice
  case $website_choice in
    1) termux-open-url https://for-myuse.infinityfreeapp.com ;;
    2) termux-open-url https://global-chat.rf.gd ;;
    3) termux-open-url https://info-here.rf.gd ;;
    4) termux-open-url https://islamic-articles.rf.gd ;;
    *) echo "Invalid option. Going back..." && sleep 1 && list_websites ;;
  esac
}
exit_script() {
  echo -e "${red}Thank you for using the script!${reset}"
  exit 0
}
clear
banner
loading
about_me
